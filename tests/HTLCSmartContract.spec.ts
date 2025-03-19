import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, Slice, toNano } from '@ton/core';
import { HTLCSmartContract } from '../wrappers/HTLCSmartContract';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { randomBytes } from 'node:crypto';
import { sha256, sha512 } from '@ton/crypto';
import { JettonMinter } from '../wrappers/JettonMintes';
import { JettonWallet } from '../wrappers/JettonWallet';

const AMOUNT = toNano(10);
describe('HTLCSmartContract', () => {
    let code: Cell;
    let codeJettonMinter: Cell;
    let codeJettonWallet: Cell;

    let jettonMinter: SandboxContract<JettonMinter>;
    let jettonGiver: SandboxContract<JettonWallet>;
    let jettonReceiver: SandboxContract<JettonWallet>;
    let jettonContract: SandboxContract<JettonWallet>;

    let randomBytesData: Buffer;
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let hTLCSmartContract: SandboxContract<HTLCSmartContract>;
    let giver: SandboxContract<TreasuryContract>;
    let receiver: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('HTLCSmartContract');
        codeJettonMinter = await compile('JettonMinter');
        codeJettonWallet = await compile('JettonWallet');
        randomBytesData = randomBytes(100);
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = 1;
        giver = await blockchain.treasury('giver');
        receiver = await blockchain.treasury('receiver');
        // mint jettons
        {
            jettonMinter = blockchain.openContract(
                JettonMinter.createFromConfig(
                    {
                        walletCode: codeJettonWallet,
                        admin: giver.address,
                        content: Cell.EMPTY,
                    },
                    codeJettonMinter,
                ),
            );

            await jettonMinter.sendDeploy(giver.getSender(), toNano('0.05'));
            await jettonMinter.sendMint(giver.getSender(), toNano('0.05'), toNano('0.01'), giver.address, AMOUNT);
            jettonGiver = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(giver.address)),
            );
            jettonReceiver = blockchain.openContract(
                JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(receiver.address)),
            );
        }

        hTLCSmartContract = blockchain.openContract(
            HTLCSmartContract.createFromConfig(
                {
                    hash: BigInt('0x' + (await sha256(randomBytesData)).toString('hex')),
                    amount: AMOUNT,
                    expiration_time: 1000,
                    giver_address: giver.address,
                    receiver_address: receiver.address,
                    jetton_address: null,
                },
                code,
            ),
        );
        jettonContract = blockchain.openContract(
            JettonWallet.createFromAddress(await jettonMinter.getWalletAddressOf(hTLCSmartContract.address)),
        );

        deployer = await blockchain.treasury('deployer');

        const deployResult = await hTLCSmartContract.sendDeploy(
            deployer.getSender(),
            toNano('0.05'),
            jettonContract.address,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: hTLCSmartContract.address,
            deploy: true,
            success: true,
        });
        await jettonGiver.sendTransfer(
            giver.getSender(),
            toNano('1'),
            toNano('0'),
            hTLCSmartContract.address,
            AMOUNT,
            Cell.EMPTY,
        );
    });

    it('should deploy', async () => {
        const balance = await jettonContract.getJettonBalance();
        expect(balance).toEqual(AMOUNT);
        const balanceGiver = await jettonGiver.getJettonBalance();
        expect(balanceGiver).toEqual(0n);
        const data = await hTLCSmartContract.getData();
        expect(data.jetton_address).toEqualAddress(jettonContract.address);
        expect(data.giver_address).toEqualAddress(giver.address);
        expect(data.receiver_address).toEqualAddress(receiver.address);
        expect(data.amount).toEqual(AMOUNT);
        expect(data.expiration_time).toEqual(1000);
        expect(data.hash).toEqual(BigInt('0x' + (await sha256(randomBytesData)).toString('hex')));
    });

    it('should provide data', async () => {
        blockchain.now = 900;
        const {transactions} = await hTLCSmartContract.sendProvideData(receiver.getSender(), toNano('0.07'), randomBytesData);
        printTransactionFees(transactions);
        const balance = await jettonReceiver.getJettonBalance();
        expect(balance).toEqual(AMOUNT);
        const balanceGiver = await jettonGiver.getJettonBalance();
        expect(balanceGiver).toEqual(0n);
        const balanceContract = await jettonContract.getJettonBalance();
        expect(balanceContract).toEqual(0n);
    });
    it("should not provide wrong data", async () => {
        blockchain.now = 900;
        const {transactions} = await hTLCSmartContract.sendProvideData(receiver.getSender(), toNano('0.07'), randomBytes(100));
        printTransactionFees(transactions);
        const balance = await jettonReceiver.getJettonBalance();
        expect(balance).toEqual(0n);
        const balanceGiver = await jettonGiver.getJettonBalance();
        expect(balanceGiver).toEqual(0n);
        const balanceContract = await jettonContract.getJettonBalance();
        expect(balanceContract).toEqual(AMOUNT);
    });
    it('should not provide data after expiration', async () => {
        blockchain.now = 1100;
        const {transactions} = await hTLCSmartContract.sendProvideData(receiver.getSender(), toNano('0.07'), randomBytesData);
        printTransactionFees(transactions);
        const balance = await jettonReceiver.getJettonBalance();
        expect(balance).toEqual(0n);
        const balanceGiver = await jettonGiver.getJettonBalance();
        expect(balanceGiver).toEqual(0n);
        const balanceContract = await jettonContract.getJettonBalance();
        expect(balanceContract).toEqual(AMOUNT);

    });
    it('should withdraw expired', async () => {
        blockchain.now = 1100;
        const {transactions} = await hTLCSmartContract.sendWithdrawExpired(giver.getSender(), toNano('0.07'));
        printTransactionFees(transactions);
        const balance = await jettonReceiver.getJettonBalance();
        expect(balance).toEqual(0n);
        const balanceGiver = await jettonGiver.getJettonBalance();
        expect(balanceGiver).toEqual(AMOUNT);
        const balanceContract = await jettonContract.getJettonBalance();
        expect(balanceContract).toEqual(0n);
    });
});
