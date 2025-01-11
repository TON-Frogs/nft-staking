
# NFT Staking


### Functions

- staking for specified period
- profit calculation by rarity and base month profit
- totally blocked NFT
- unstaking after period end


### Contracts

- Base pool
- Individual staking

Base pool contract stores all staking settings, owns all staking rewards, gets NFT for stakes and resends them to individual staking contracts with jettons as reward

Individual staking contract owns NFTs and jettons during staking period


### Structures

- **Pool contract storage**

```
pool_storage admin_address:MsgAddress jetton_master:MsgAddress jetton_wallet_code:^Cell, nfts:(HashmapE 256 ^Cell) staking_code:^Cell staking_params:^Cell
```

`admin_address` - address with ability to change staking_params \
`jetton_master` - address of staking jetton \
`jetton_wallet_code` - BOC of jetton wallet contract \
`nfts` - Dictionary with NFTs rarity (uint32) \
`staking_code` - BOC of individual staking contract \
`staking_params` - cell with current staking params

- **Staking params**

```
staking_params minimal_time:uint64 month_profit:Coins max_rarity:uint32 rarity_add:uint32
```

`minimal_time` - minimal stake period (in seconds) \
`month_profit` - monthly staking reward \
`max_rarity` - maximal rarity value of NFT collection (equal to collection items count) \
`rarity_add` - additional staking reward depends on rarity value (in percents, not float)

- **Individual staking contract storage**

```
staking_storage base_address:MsgAddress owner_address:MsgAddress next_stake_index:uint64 stakes:(HashmapE 64 ^Cell) jetton_master:MsgAddress jetton_wallet_code:^Cell
```

`base_address` - address of staking base pool \
`owner_address` - receiver of staking rewards \
`next_stake_index` - index of next key in stakes dict \
`stakes` - dict of stakes \
`jetton_master` - address of staking jetton \
`jetton_wallet_code` - BOC of jetton wallet contract

- **Stakes**

Dictionary storage of stakes in individual staking contract \
Stakes are set in `dict` by `udict_set` method with uint64 index starting from 0 \
Index increases by 1 each stake

- **Stake item**

```
stake_item nft:MsgAddress final_sum:Coins start_time:uint64 end_time:uint64
```

`nft` - staked NFT address \
`final_sum` - amount of jettons received after stake \
`start_time` - stake start timestamp \
`end_time` - stake end timestamp


### Base pool methods

- **Deploy staking contract** \
Required for each address \
Has no parameters



Received funds will be resent to individual staking contract

```
deploy_staking#00000001
```

- **Create stake** \
Placed in payload of NFT transfer

```
stake#00000002 stake_time:uint64
```

`stake_time` - stake period in seconds

### Individual staking methods


- **Create stake** \
Placed in payload of jetton transfer \
Must be sent from base pool address

```
stake#00000001 nft:MsgAddress final_sum:Coins start_time:uint64 end_time:uint64
```

- **Unstake NFT and jettons** \
Is able after stake period
Returns NFT to owner and send jetton reward

```
unstake#00000002 stake_index:uint64
```

`stake_index` - index of stake in contract storage for unstaking
