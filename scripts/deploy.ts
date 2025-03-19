import { beginCell, Cell, fromNano, toNano } from '@ton/core';
import { HTLCSmartContract } from '../wrappers/HTLCSmartContract';
import { compile, NetworkProvider } from '@ton/blueprint';
import { randomAddress } from '@ton/test-utils';
import { randomBytes } from 'node:crypto';
import { sha256 } from '@ton/crypto';
import { JettonMinter } from '../wrappers/JettonMintes';
import { JettonWallet } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const ui = await provider.ui();
    const expiredAt = Math.floor(+(new Date)/1000) + +(await ui.input('Enter expiration time in seconds'));
    const amount = toNano(await ui.input('Enter amount'));
    const receiver_address = await ui.inputAddress('Enter receiver address');
    const jetton_master = await ui.inputAddress('Enter jetton master address');
    const data = randomBytes(100);
    console.log('SECRET DATA: ', data.toString("hex"));
    const hTLCSmartContract = provider.open(
        HTLCSmartContract.createFromConfig(
            {
                jetton_address: null,
                expiration_time:expiredAt,
                amount,
                receiver_address,
                hash: BigInt("0x"+ (await sha256(data)).toString('hex')),
                giver_address: provider.sender().address!,
            },
            await compile('HTLCSmartContract')
        )
    );
    const jettonMaster = await provider.open(
        JettonMinter.createFromAddress(jetton_master)
    );
    const jettonChild = await jettonMaster.getWalletAddressOf(hTLCSmartContract.address);
    await hTLCSmartContract.sendDeploy(provider.sender(), toNano('0.05'), jettonChild);

    await provider.waitForDeploy(hTLCSmartContract.address);

    await provider.open(
        JettonWallet.createFromAddress(
            await jettonMaster.getWalletAddressOf(provider.sender().address!)
        )
    ).sendTransfer(
        provider.sender(),
        toNano('0.05'),
        toNano('0'),
        hTLCSmartContract.address,
        amount,
        Cell.EMPTY,
    );
    console.log("Minted at", hTLCSmartContract.address)
}