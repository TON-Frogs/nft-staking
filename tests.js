const fs = require('fs');
const ton_core = require('@ton/core');
const compiler = require('@ton-community/func-js');
const ton_sandbox = require('@ton/sandbox');


const addr = ton_core.address;
const beginCell = ton_core.beginCell;
const Cell = ton_core.Cell;
const Dictionary = ton_core.Dictionary;


let ton;

let jetton_minter_code = Cell.fromBoc(fs.readFileSync('contracts/boc/jetton_minter.boc'))[0];
let jetton_wallet_code = Cell.fromBoc(fs.readFileSync('contracts/boc/jetton_wallet.boc'))[0];
let collection_code = Cell.fromBoc(fs.readFileSync('contracts/boc/nft_collection_editable.boc'))[0];
let nft_code = Cell.fromBoc(fs.readFileSync('contracts/boc/nft_item.boc'))[0];
let nft_staking_pool_code;
let nft_staking_code;


let wallet;
let jetton_minter;
let jetton_wallet;
let collection;
let pool;
let staking;
let pool_jetton_wallet;
let staking_jetton_wallet;


let staking_params;
let nfts = {};


async function compile(filename) {

    let r = {
        targets: ['stdlib.fc', filename],
        sources: {
            'stdlib.fc': fs.readFileSync('contracts/stdlib.fc', 'utf-8'),
        }
    };

    r.sources[filename] = fs.readFileSync(`contracts/${filename}`, 'utf-8');
    
    r = await compiler.compileFunc(r);

    if(r.status === 'error') throw Error(r.message);

    return Cell.fromBase64(r.codeBoc);

}


function logTxs(txs) {

    for(let tx of txs.transactions) {

        console.log(tx.inMessage);
        console.log(tx.vmLogs);

    }

}




function bufToBigInt(buf) {

    return BigInt('0x' + buf.toString('hex'));

}



function init(init_data) {

    return {
        init: init_data,
        address: ton_core.contractAddress(0, init_data)
    };

}

function jettonMinter(params) {
    
    return init({
        code: jetton_minter_code,
        data: beginCell()
            .storeCoins(0)
            .storeAddress(params.owner)
            .storeRef(beginCell().endCell())
            .storeRef(jetton_wallet_code)
        .endCell()
    });
    
}

function NFTCollection(params) {
    
    return init({
        code: collection_code,
        data: beginCell()
            .storeAddress(params.owner)
            .storeUint(0, 64)
            .storeRef(beginCell()
                .storeRef(beginCell().storeBuffer(Buffer.from('https://somemetadata.com/collection.js')).endCell())
                .storeRef(beginCell().storeBuffer(Buffer.from('https://somemetadata.com/nft/')).endCell())
            .endCell())
            .storeRef(nft_code)
            .storeRef(beginCell()
                .storeUint(Math.floor(0.1 * 1000), 16)
                .storeUint(1000, 16)
                .storeAddress(params.owner)
            .endCell())
        .endCell()
    });
    
}


function stakingPool(params) {
    
    return init({
        code: nft_staking_pool_code,
        data: beginCell()
            .storeAddress(params.admin_address)
            .storeAddress(params.jetton_master)
            .storeRef(jetton_wallet_code)
            .storeDict(null)
            .storeRef(nft_staking_code)
            .storeRef(beginCell()
                .storeUint(params.staking_params.minimal_time, 64)
                .storeCoins(params.staking_params.month_profit)
                .storeUint(params.staking_params.max_rarity, 32)
                .storeUint(params.staking_params.rarity_add, 32)
            .endCell())
        .endCell()
    });

}



async function balance(address) {

    return (await ton.getContract(address)).balance;

}

async function getAddress(method, master, address) {

    return (await ton.runGetMethod(master, method, [{
        type: 'slice',
        cell: beginCell().storeAddress(address).endCell()
    }])).stack[0].cell.asSlice().loadAddress();

}

async function getNFTAddress(index) {

    return (await ton.runGetMethod(collection.address, 'get_nft_address_by_index', [{type: 'int', value: index}])).stack[0].cell.asSlice().loadAddress();

}

async function getNFTOwner(nft) {

    return (await ton.runGetMethod(nft, 'get_nft_data')).stack[3].cell.asSlice().loadAddress();

}




async function deployJetton() {
    
    return await wallet.send({
        to: jetton_minter.address,
        value: 0.1e9,
        init: jetton_minter.init
    });

}

async function jettonMint(params) {
    
    return await wallet.send({
        to: jetton_minter.address,
        value: 0.1e9,
        body: beginCell()
            .storeUint(21, 32)
            .storeUint(0, 64)
            .storeAddress(params.to)
            .storeCoins(0.1e9)
            .storeRef(beginCell()
                .storeUint(0x178d4519, 32)
                .storeUint(0, 64)
                .storeCoins(params.sum)
                .storeAddress(null)
                .storeAddress(null)
                .storeCoins(0)
                .storeBit(0)
            .endCell())
        .endCell()
    });

}

async function jettonBalance(address) {

    return (await ton.runGetMethod(address, 'get_wallet_data')).stack[0].value;

}

function jettonBody(params) {

    return beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(params.query_id || 0, 64)
        .storeCoins(params.sum)
        .storeAddress(params.to)
        .storeAddress(wallet.address)
        .storeBit(0)
        .storeCoins(params.payload_amount || 1)
        .storeBit(1)
        .storeRef(params.payload)
    .endCell();

}


async function sendJettons(params) {

    return await wallet.send({
        to: jetton_wallet,
        value: 0.1e9 + (params.payload_amount || 0),
        body: jettonBody({
            to: params.to,
            sum: params.sum,
            payload_amount: params.payload_amount || 1,
            payload: params.payload
        })
    });

}




async function deployNFTCollection() {
    
    return await wallet.send({
        to: collection.address,
        value: 0.1e9,
        init: collection.init
    });

}


async function deployNFT(params) {

    return await wallet.send({
        to: collection.address,
        value: 0.1e9,
        body: beginCell()
            .storeUint(1, 32)
            .storeUint(0, 64)
            .storeUint(params.index, 64)
            .storeCoins(0.02e9)
            .storeRef(beginCell()
                .storeAddress(params.owner)
                .storeRef(beginCell().storeBuffer(Buffer.from(params.meta)).endCell())
            .endCell())
        .endCell()
    });

}



async function deployStakingPool() {
    
    return await wallet.send({
        to: pool.address,
        value: 0.1e9,
        init: pool.init
    });

}

async function deployStaking() {

    return await wallet.send({
        to: pool.address,
        value: 0.05e9,
        body: beginCell()
            .storeUint(1, 32)
        .endCell()
    });

}


async function sendNFT(params) {

    return await wallet.send({
        to: params.nft,
        value: 0.05e9 + (params.payload_amount || 0),
        body: beginCell()
            .storeUint(0x5fcc3d14, 32)
            .storeUint(params.query_id, 64)
            .storeAddress(params.to)
            .storeAddress(params.response)
            .storeUint(0, 1)
            .storeCoins(params.payload_amount)
            .storeRef(params.payload)
        .endCell()
    });

}

async function stake(params) {

    return await sendNFT({
        nft: params.nft,
        to: pool.address,
        response: wallet.address,
        query_id: 0,
        payload_amount: 0.15e9,
        payload: beginCell()
            .storeUint(2, 32)
            .storeUint(params.time, 64)
        .endCell()
    });

}


function send_unstake(stake_index) {

    return wallet.send({
        to: staking,
        value: 0.15e9,
        body: beginCell()
            .storeUint(2, 32)
            .storeUint(0, 64)
            .storeUint(stake_index, 64)
        .endCell()
    });

}


async function unstake(stake) {
    
    ton.now = stake.end+1;

    let r = await send_unstake(stake.index);

    delete ton.now;

    return r;

}

async function getStakes() {

    let stakes = (await ton.runGetMethod(staking, 'get_staking_data')).stack[3];
    let r = [];

    if(stakes.type === 'cell') {
        
        stakes = stakes.cell.asSlice().loadDictDirect(Dictionary.Keys.Uint(64), { parse: (src) => src });
        
        for(let stake of stakes._map) {

            r.push({
                index: Number(stake[0].substring(2)),
                claimed: stake[1].loadBit(),
                nft: stake[1].loadAddress(),
                final_sum: stake[1].loadCoins(64),
                start: stake[1].loadUint(64),
                end: stake[1].loadUint(64)
            });

        }

    }

    return r;

}


function setStakingParams(params) {

    return wallet.send({
        to: pool.address,
        value: 0.01e9,
        body: beginCell()
            .storeUint(10, 32)
            .storeRef(beginCell()
                .storeUint(params.minimal_time, 64)
                .storeCoins(params.month_profit)
                .storeUint(params.max_rarity, 32)
                .storeUint(params.rarity_add, 32)
            .endCell())
        .endCell()
    });

}

function setStakingNFTs(nfts) {

    let dict = Dictionary.empty();

    for(let nft in nfts) {

        dict.set(bufToBigInt(addr(nft).hash), nfts[nft]);

    }

    return wallet.send({
        to: pool.address,
        value: 0.01e9,
        body: beginCell()
            .storeUint(11, 32)
            .storeDict(dict, Dictionary.Keys.BigUint(256), {

                serialize: (src, builder) => {
                    
                    builder.storeUint(src, 32);
    
                }
            
            })
        .endCell()
    });

}



function calculateProfit(params) {

    return Math.floor((staking_params.month_profit + Math.floor(Math.floor(staking_params.month_profit * staking_params.rarity_add * (staking_params.max_rarity - params.rarity) / 100) / staking_params.max_rarity)) * params.time / 2592000);

}


async function checkOne(params) {

    params.rarity = nfts[params.nft];
    
    console.log('\nStarting single stake test', params);

    let bal1;
    
    try {

        bal1 = await jettonBalance(staking_jetton_wallet);

    } catch {

        bal1 = 0n;

    }


    await stake(params);


    let new_owner = await getNFTOwner(params.nft);

    if(new_owner.toString() === staking.toString()) 
        console.log(`SUCCESS: NFT owner was changed to staking contract`);
        else throw Error(`ERROR: NFT owner wasn't changed to staking contract. New owner: ${new_owner}`);

    
    let bal2 = await jettonBalance(staking_jetton_wallet);
    let stakes = await getStakes();
    let final_sum = BigInt(calculateProfit(params));
    
    if(bal2-bal1 === final_sum && final_sum === stakes[stakes.length-1].final_sum) 
        console.log(`SUCCESS: Contract got correct final_sum ${final_sum}`);
        else throw Error(`ERROR: Contract got: ${bal2-bal1}, stake final sum: ${stakes[stakes.length-1].final_sum}, correct final sum: ${final_sum}`);



    bal1 = await jettonBalance(jetton_wallet);

    await send_unstake(stakes[stakes.length-1].index);

    bal2 = await jettonBalance(jetton_wallet);

    if(bal2-bal1 === 0n) 
        console.log(`SUCCESS: Contract didn't send reward before stake end`);
        else throw Error(`ERROR: Contract sent reward before stake end`);



    await unstake(stakes[stakes.length-1]);

        
    new_owner = await getNFTOwner(params.nft);

    if(new_owner.toString() === wallet.address.toString())
        console.log(`SUCCESS: NFT was returned to wallet`);
        else throw Error(`ERROR: NFT wasn't returned to wallet. New owner: ${new_owner}`);


    bal2 = await jettonBalance(jetton_wallet);

    if(bal2-bal1 === final_sum)
        console.log(`SUCCESS: Contract sent correct reward ${final_sum}`);
        else throw Error(`ERROR: Contract sent wrond reward ${bal2-bal1}`);


    stakes = await getStakes();

    if(stakes[stakes.length-1].claimed === true)
        console.log(`SUCCESS: Stake status changed to claimed`);
        else throw Error(`ERROR: Stake status is ${stakes[stakes.length-1].claimed}`);


}


async function checkAll(params) {
    
    console.log('\nStarting all NFT stake test', params);

    let time = params.time_step;

    for(let nft in nfts) {

        let bal1;
        
        try {

            bal1 = await jettonBalance(staking_jetton_wallet);

        } catch {

            bal1 = 0n;

        }


        let nft_addr = addr(nft);

        await stake({
            nft: nft_addr,
            time
        });


        let new_owner = await getNFTOwner(nft_addr);
    
        if(new_owner.toString() !== staking.toString()) 
            throw Error(`ERROR: NFT owner wasn't changed to staking contract. New owner: ${new_owner}`);

        
        let bal2 = await jettonBalance(staking_jetton_wallet);
        let stakes = await getStakes();
        let final_sum = BigInt(calculateProfit({ rarity: nfts[nft], time }));
        
        if(bal2-bal1 !== final_sum || final_sum !== stakes[stakes.length-1].final_sum) 
            throw Error(`ERROR: Contract got: ${bal2-bal1}, stake final sum: ${stakes[stakes.length-1].final_sum}, correct final sum: ${final_sum}`);



        bal1 = await jettonBalance(jetton_wallet);

        await send_unstake(stakes[stakes.length-1].index);

        bal2 = await jettonBalance(jetton_wallet);

        if(bal2-bal1 !== 0n) 
            throw Error(`ERROR: Contract sent reward before stake end`);


        await unstake(stakes[stakes.length-1]);


        new_owner = await getNFTOwner(nft_addr);
    
        if(new_owner.toString() !== wallet.address.toString()) 
            throw Error(`ERROR: NFT wasn't returned to wallet. New owner: ${new_owner}`);


        bal2 = await jettonBalance(jetton_wallet);

        if(bal2-bal1 !== final_sum)
            throw Error(`ERROR: Contract sent wrond reward ${bal2-bal1}`);


        stakes = await getStakes();

        if(stakes[stakes.length-1].claimed !== true)
            throw Error(`ERROR: Stake status is ${stakes[stakes.length-1].claimed}`);

        
        time += params.time_step;

    }

    console.log('Many stakes test: SUCCESS');

}



async function checkAdminCall() {

    let params = staking_params;
    
    console.log('\nStarting admin function test', params, nfts);

    await setStakingParams(params);
    await setStakingNFTs(nfts);


    let r = await ton.runGetMethod(pool.address, 'get_staking_pool_data');

    let new_params = r.stack[5].cell.asSlice();
    let minimal_time = new_params.loadUint(64);
    let month_profit = new_params.loadCoins();
    let max_rarity = new_params.loadUint(32);
    let rarity_add = new_params.loadUint(32);

    if(minimal_time === params.minimal_time && month_profit === BigInt(params.month_profit) && max_rarity === params.max_rarity && rarity_add === params.rarity_add)
        console.log(`SUCCESS: Staking params were changed correctly`);
        else throw Error(`ERROR: Staked params weren't changed correctly. minimal_time: ${minimal_time}, month_profit: ${month_profit}, max_rarity: ${max_rarity}, rarity_add: ${rarity_add}`);


    let new_nfts_cell = r.stack[3].cell;
    let new_nfts = {};

    try {

        new_nfts_cell = new_nfts_cell.asSlice().loadDictDirect(Dictionary.Keys.BigUint(256), { parse: (src) => src.loadUint(32) });
        
        for(let nft of new_nfts_cell._map) {
            
            new_nfts[addr('0:' + BigInt(nft[0].substring(2)).toString(16).padStart(64, '0')).toString()] = nft[1];

        }

    } catch (err) { console.log(err) }

    
    let equal = true;

    for(let nft in new_nfts) {

        if(new_nfts[nft] !== nfts[nft]) {

            equal = false;

            break;

        }

    }

    if(Object.keys(nfts).length === Object.keys(new_nfts).length && equal)
        console.log(`SUCCESS: NFT rarities were changed correctly`);
        else throw Error(`ERROR: NFT rarities weren't changed correctly`);
        
}



(async () => {

    nft_staking_pool_code = await compile('nft_staking_pool.fc');
    nft_staking_code = await compile('nft_staking.fc');
    

    ton = await ton_sandbox.Blockchain.create();

    wallet = await ton.treasury('wallet');


    jetton_minter = jettonMinter({
        owner: wallet.address
    });

    await deployJetton();


    await jettonMint({
        to: wallet.address,
        sum: 10000000e9
    });


    jetton_wallet = await getAddress('get_wallet_address', jetton_minter.address, wallet.address);



    collection = NFTCollection({
        owner: wallet.address
    });

    await deployNFTCollection();

    let rarities = [1, 682, 239, 573, 1111];
    let nft_addresses = [];

    for(let i = 0; i < 5; i++) {

        await deployNFT({
            index: i,
            owner: wallet.address,
            meta: `${i}.json`
        });

        nft_addresses[i] = await getNFTAddress(i);

        nfts[nft_addresses[i].toString()] = rarities[i];

    }


    staking_params = {
        minimal_time: 5,
        month_profit: 100e9,
        max_rarity: 0,
        rarity_add: 15
    };
    
    pool = stakingPool({
        admin_address: wallet.address,
        jetton_master: jetton_minter.address,
        staking_params
    });


    await deployStakingPool();

    await deployStaking();



    await sendJettons({
        to: pool.address,
        sum: 5000000e9,
        payload: beginCell()
            .storeUint(0, 32)
            .storeUint(0, 64)
        .endCell()
    });


    staking = await getAddress('get_staking_address', pool.address, wallet.address);
    pool_jetton_wallet = await getAddress('get_wallet_address', jetton_minter.address, pool.address);
    staking_jetton_wallet = await getAddress('get_wallet_address', jetton_minter.address, staking);

    console.log('pool address:', pool.address);
    console.log('staking address:', staking);


    console.log('\nStart wallet jetton balance:', await jettonBalance(jetton_wallet));



    staking_params = {
        minimal_time: 1,
        month_profit: 7500e9,
        max_rarity: 1111,
        rarity_add: 20
    };

    await checkAdminCall();



    await checkOne({
        nft: nft_addresses[0],
        time: 2
    });
    
    await checkAll({
        time_step: 4000
    });

    await checkOne({
        nft: nft_addresses[nft_addresses.length-1],
        time: 86400*30
    });

    
    console.log('\nEnd wallet jetton balance:', await jettonBalance(jetton_wallet));

})();
