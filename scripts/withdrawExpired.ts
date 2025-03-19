import { Address, toNano } from '@ton/core';
import { HTLCSmartContract } from '../wrappers/HTLCSmartContract';
import { NetworkProvider, sleep } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const address = Address.parse(args.length > 0 ? args[0] : await ui.input('HTLCSmartContract address'));

    if (!(await provider.isContractDeployed(address))) {
        ui.write(`Error: Contract at address ${address} is not deployed!`);
        return;
    }
    const hTLCSmartContract = provider.open(HTLCSmartContract.createFromAddress(address));

    await hTLCSmartContract.sendWithdrawExpired(
        provider.sender(),
        toNano("0.07")
    );
}
