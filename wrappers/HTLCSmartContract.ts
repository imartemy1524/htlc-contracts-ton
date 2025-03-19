import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice
} from '@ton/core';

export type HTLCSmartContractConfig = {
    jetton_address: Address|null;
    giver_address: Address;
    receiver_address: Address;
    amount: bigint;
    expiration_time: number;
    hash: bigint;
};

export function hTLCSmartContractConfigToCell(config: HTLCSmartContractConfig): Cell {
    return beginCell()
        .storeRef(
            beginCell()
                .storeAddress(config.jetton_address)
                .storeAddress(config.giver_address)
                .storeAddress(config.receiver_address)
                .endCell()
        )
        .storeCoins(config.amount)
        .storeUint(config.expiration_time, 40)
        .storeUint(config.hash, 256)
        .endCell();
}

export const Opcodes = {
    deploy: 0x822d8ae,
    provide_data: 0xe64ad8ec,
    withdraw_expired: 0xd0066d3b
};

export class HTLCSmartContract implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new HTLCSmartContract(address);
    }

    static createFromConfig(config: HTLCSmartContractConfig, code: Cell, workchain = 0) {
        const data = hTLCSmartContractConfigToCell(config);
        const init = { code, data };
        return new HTLCSmartContract(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, jettonAddress: Address) {
        return provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.deploy, 32)
                .storeAddress(jettonAddress)
                .endCell(),
        });
    }

    async sendProvideData(provider: ContractProvider, via: Sender, value: bigint, data: Slice|Buffer) {
        if(Buffer.isBuffer(data)){
            data = beginCell().storeBuffer(data).endCell().asSlice();
        }
        if(data.remainingBits > 904 || data.remainingRefs)
            throw new Error('Data is too large');
        if(data.remainingBits % 8)
            throw new Error('Data is not byte-aligned');
        return provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.provide_data, 32)
                .storeSlice(data)
                .endCell(),
        });
    }
    async sendWithdrawExpired(provider: ContractProvider, via: Sender, value: bigint) {
        return provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.withdraw_expired, 32)
                .endCell(),
        });
    }


    async getData(provider: ContractProvider): Promise<HTLCSmartContractConfig> {
        const result = await provider.get('data', []);
        return {
            jetton_address: result.stack.readAddress(),
            giver_address: result.stack.readAddress(),
            receiver_address: result.stack.readAddress(),
            amount: result.stack.readBigNumber(),
            expiration_time: result.stack.readNumber(),
            hash: result.stack.readBigNumber()
        }
    }
}
