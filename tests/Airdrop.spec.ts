import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, Dictionary, beginCell, toNano } from '@ton/core';
import { jettonContentToCell } from '../wrappers/JettonMaster';
import { Airdrop, AirdropEntry, generateEntriesDictionary } from '../wrappers/Airdrop';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '../wrappers/JettonMaster';
import { AirdropHelper } from '../wrappers/AirdropHelper';
import {log} from "console";

describe('Airdrop', () => {

    let code: Cell;
    let codeHelper: Cell;
    let codeJettonMaster: Cell;
    let codeJettonWallet: Cell;
    let defaultContent:Cell;
    let mintSupply:bigint;
    let jettonWalletForTxn:any


    beforeAll(async () => {
        code = await compile('Airdrop');
        codeHelper = await compile('AirdropHelper');
        codeJettonMaster = await compile('JettonMaster');
        codeJettonWallet = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let airdrop: SandboxContract<Airdrop>;
    let dictionary: Dictionary<bigint, AirdropEntry>;
    let dictCell: Cell;
    let users: SandboxContract<TreasuryContract>[];
    let jettonAdmin:SandboxContract<TreasuryContract>;
    let jettonMaster: SandboxContract<JettonMaster>;
    let entries: AirdropEntry[];
    

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        jettonAdmin = await blockchain.treasury('deployer')
        defaultContent = jettonContentToCell({type: 1, uri: "https://testjetton.org/content.json"});
        users = await blockchain.createWallets(1000);
        mintSupply = toNano(888888888);

        entries = [];
        for (let i = 0; i < 1000; i++) {
            entries.push({
                address: users[parseInt(i.toString())].address,
                amount: BigInt(Math.floor(Math.random() * 1e9)),
            });
        }
        dictionary = generateEntriesDictionary(entries);

        dictCell = beginCell().storeDictDirect(dictionary).endCell();

        jettonMaster = blockchain.openContract(
          JettonMaster.createFromConfig(
            {
              totalSupply:toNano(0),
              admin:jettonAdmin.address,
              content:defaultContent,
              wallet_code:codeJettonWallet
            },
            codeJettonMaster
          )
        );

      jettonWalletForTxn = async (address:Address) => blockchain.openContract(
        JettonWallet.createFromAddress(
          await jettonMaster.getWalletAddress(address)
        )
      );


        await jettonMaster.sendDeploy(jettonAdmin.getSender(), toNano('0.05'));

        airdrop = blockchain.openContract(
            Airdrop.createFromConfig(
                {
                    helperCode: codeHelper,
                    merkleRoot: BigInt('0x' + dictCell.hash().toString('hex')),
                },
                code
            )
        );

        const deployResult = await airdrop.sendDeploy(
            users[0].getSender(),
            toNano('0.05'),
            await jettonMaster.getWalletAddress(airdrop.address)
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: users[0].address,
            to: airdrop.address,
            deploy: true,
            success: true,
        });

        const adminJettonWallet = await jettonWalletForTxn(jettonAdmin.address)
        const airdropJettonWallet = await jettonWalletForTxn(airdrop.address)
        const adminInitialJettonBalance = await adminJettonWallet.getJettonBalance();

        expect(adminInitialJettonBalance).toBe(toNano(0));

        await jettonMaster.sendMint(
            jettonAdmin.getSender(),
            jettonAdmin.address,
            mintSupply,
            toNano('0.05'),
            toNano('1'),
        );
      
      const adminJettonBalanceAfterMint = await adminJettonWallet.getJettonBalance();
      
      console.log(`Admin jetton wallet address: ${adminJettonWallet.address}`)
      console.log(`Airdrop Jetton Wallet address: ${airdropJettonWallet.address}`)
      
      expect(adminJettonBalanceAfterMint).toBe(mintSupply);


      const sendJettonsToAirdropContract = await adminJettonWallet.sendTransfer(jettonAdmin.getSender(),
      toNano(0.1),toNano(4000),airdrop.address,jettonAdmin.address,null,toNano('0.05'),null
    )

    const aidropContractJettonBalance = await airdropJettonWallet.getJettonBalance();

    expect(aidropContractJettonBalance).toBe(toNano(4000))

    printTransactionFees(sendJettonsToAirdropContract.transactions);
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and airdrop are ready to use
    });

    it('should claim one time', async () => {
        const merkleProof = dictionary.generateMerkleProof(1n);
        const helper = blockchain.openContract(
            AirdropHelper.createFromConfig(
                {
                    airdrop: airdrop.address,
                    index: 1n,
                    proofHash: merkleProof.hash(),
                },
                codeHelper
            )
        );
        await helper.sendDeploy(users[1].getSender());
        const result = await helper.sendClaim(123n, merkleProof);
        expect(result.transactions).toHaveTransaction({
            on: airdrop.address,
            success: true,
        });
        expect(
            await blockchain
                .openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address)))
                .getJettonBalance()
        ).toEqual(dictionary.get(1n)?.amount);
        expect(await helper.getClaimed()).toBeTruthy();
    });

    it('should claim many times', async () => {
        for (let i = 0; i < 1000; i += 1 + Math.floor(Math.random() * 25)) {
            const merkleProof = dictionary.generateMerkleProof(BigInt(i));
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: BigInt(i),
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );
            await helper.sendDeploy(users[i].getSender());
            const result = await helper.sendClaim(123n, merkleProof);
            expect(result.transactions).toHaveTransaction({
                on: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[i].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(BigInt(i))?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });

    it('should not claim if already did', async () => {
        const merkleProof = dictionary.generateMerkleProof(1n);

        const helper = blockchain.openContract(
            AirdropHelper.createFromConfig(
                {
                    airdrop: airdrop.address,
                    index: 1n,
                    proofHash: merkleProof.hash(),
                },
                codeHelper
            )
        );
        await helper.sendDeploy(users[1].getSender());

        {
            const result = await helper.sendClaim(123n, merkleProof);
            expect(result.transactions).toHaveTransaction({
                on: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1n)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }

        {
            await expect(helper.sendClaim(123n, merkleProof)).rejects.toThrow();
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1n)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }

        {
            await expect(helper.sendClaim(123n, merkleProof)).rejects.toThrow();
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1n)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });

    it('should not claim with wrong index', async () => {
        {
            const merkleProof = dictionary.generateMerkleProof(2n);
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: 1n,
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );
            await helper.sendDeploy(users[1].getSender());
            const result = await helper.sendClaim(123n, merkleProof);
            expect(result.transactions).toHaveTransaction({
                from: helper.address,
                to: airdrop.address,
                success: false,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(0n);
        }

        {
            const merkleProof = dictionary.generateMerkleProof(1n);
            const helper = blockchain.openContract(
                AirdropHelper.createFromConfig(
                    {
                        airdrop: airdrop.address,
                        index: 1n,
                        proofHash: merkleProof.hash(),
                    },
                    codeHelper
                )
            );
            await helper.sendDeploy(users[1].getSender());
            const result = await helper.sendClaim(123n, merkleProof);
            expect(result.transactions).toHaveTransaction({
                from: helper.address,
                to: airdrop.address,
                success: true,
            });
            expect(
                await blockchain
                    .openContract(
                        JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(users[1].address))
                    )
                    .getJettonBalance()
            ).toEqual(dictionary.get(1n)?.amount);
            expect(await helper.getClaimed()).toBeTruthy();
        }
    });
});




