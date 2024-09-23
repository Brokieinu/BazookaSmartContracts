import { Blockchain, SandboxContract, TreasuryContract, internal, BlockchainSnapshot } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster, jettonContentToCell } from '../wrappers/JettonMaster';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { randomAddress, getRandomTon, differentAddress, getRandomInt, testJettonTransfer, testJettonInternalTransfer, testJettonNotification, testJettonBurnNotification } from './utils';
import { Op, Errors } from '../wrappers/JettonConstants';

/*
   These tests check compliance with the TEP-74 and TEP-89,
   but also checks some implementation details.
   If you want to keep only TEP-74 and TEP-89 compliance tests,
   you need to remove/modify the following tests:
     mint tests (since minting is not covered by standard)
     exit_codes
     prove pathway
*/

//jetton params

// let fwd_fee = 1804014n, gas_consumption = 15000000n, min_tons_for_storage = 100000000n;
// let fwd_fee = 1804014n, gas_consumption = 14000000n, min_tons_for_storage = 10000000n;

describe('JettonWallet', () => {
    let jwallet_code = new Cell();
    let master_code = new Cell();
    let blockchain: Blockchain;
    let deployer:SandboxContract<TreasuryContract>;
    let notDeployer:SandboxContract<TreasuryContract>;
    let jettonMaster:SandboxContract<JettonMaster>;
    let userWallet:any;
    let defaultContent:Cell;
    let lockSmartContractAddr

    beforeAll(async () => {
        jwallet_code   = await compile('JettonWallet');
        master_code    = await compile('JettonMaster');
        blockchain     = await Blockchain.create();
        deployer       = await blockchain.treasury('deployer');
        notDeployer    = await blockchain.treasury('notDeployer');
        lockSmartContractAddr = await blockchain.treasury('lockSmartContract');
        defaultContent = jettonContentToCell({type: 1, uri: "https://testjetton.org/content.json"});
        jettonMaster   = blockchain.openContract(
                   JettonMaster.createFromConfig(
                     {
                       totalSupply:toNano(888888888),
                       admin: deployer.address,
                       content: defaultContent,
                       wallet_code: jwallet_code,
                     },
                     master_code));
        userWallet = async (address:Address) => blockchain.openContract(
                          JettonWallet.createFromAddress(
                            await jettonMaster.getWalletAddress(address)
                          )
                     );
    });

    // implementation detail
    it('should deploy', async () => {
        const deployResult = await jettonMaster.sendDeploy(deployer.getSender(), toNano('100'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMaster.address,
            deploy: true,
        });
    });
    // implementation detail
    it('minter admin should be able to mint jettons', async () => {
        // can mint from deployer
        let initialTotalSupply = await jettonMaster.getTotalSupply();
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = toNano('1000.23');
        const mintResult = await jettonMaster.sendMint(deployer.getSender(), deployer.address, initialJettonBalance, toNano('0.05'), toNano('1'));

        expect(mintResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployerJettonWallet.address,
            deploy: true,
        });
		
        expect(mintResult.transactions).toHaveTransaction({ // excesses
            from: deployerJettonWallet.address,
            to: jettonMaster.address
        });
		

        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply + initialJettonBalance);
        initialTotalSupply += initialJettonBalance;
        // can mint from deployer again
        let additionalJettonBalance = toNano('2.31');
        await jettonMaster.sendMint(deployer.getSender(), deployer.address, additionalJettonBalance, toNano('0.05'), toNano('1'));
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance + additionalJettonBalance);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply + additionalJettonBalance);
        initialTotalSupply += additionalJettonBalance;
        // can mint to other address
        let otherJettonBalance = toNano('3.12');
        await jettonMaster.sendMint(deployer.getSender(), notDeployer.address, otherJettonBalance, toNano('0.05'), toNano('1'));
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(otherJettonBalance);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply + otherJettonBalance);
    });

    // implementation detail
    it('not a minter admin should not be able to mint jettons', async () => {
        let initialTotalSupply = await jettonMaster.getTotalSupply();
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        const unAuthMintResult = await jettonMaster.sendMint(notDeployer.getSender(), deployer.address, toNano('777'), toNano('0.05'), toNano('1'));

        expect(unAuthMintResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: jettonMaster.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_mint_request
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply);
    });


    // Implementation detail
    it('minter admin can change admin', async () => {
        const adminBefore = await jettonMaster.getAdminAddress();
        expect(adminBefore).toEqualAddress(deployer.address);
        let res = await jettonMaster.sendChangeAdmin(deployer.getSender(), notDeployer.address);
        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            on: jettonMaster.address,
            success: true
        });

	const adminAfter = await jettonMaster.getAdminAddress();
        expect(adminAfter).toEqualAddress(notDeployer.address);
        await jettonMaster.sendChangeAdmin(notDeployer.getSender(), deployer.address);
        expect((await jettonMaster.getAdminAddress()).equals(deployer.address)).toBe(true);
    });
    it('not a minter admin can not change admin', async () => {
        const adminBefore = await jettonMaster.getAdminAddress();
        expect(adminBefore).toEqualAddress(deployer.address);
        let changeAdmin = await jettonMaster.sendChangeAdmin(notDeployer.getSender(), notDeployer.address);
        expect((await jettonMaster.getAdminAddress()).equals(deployer.address)).toBe(true);
        expect(changeAdmin.transactions).toHaveTransaction({
            from: notDeployer.address,
            on: jettonMaster.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_change_admin_request
        });
    });

    it('minter admin can change content', async () => {
        let newContent = jettonContentToCell({type: 1, uri: "https://totally_new_jetton.org/content.json"})
        expect((await jettonMaster.getContent()).equals(defaultContent)).toBe(true);
        let changeContent = await jettonMaster.sendChangeContent(deployer.getSender(), newContent);
        expect((await jettonMaster.getContent()).equals(newContent)).toBe(true);
        changeContent = await jettonMaster.sendChangeContent(deployer.getSender(), defaultContent);
        expect((await jettonMaster.getContent()).equals(defaultContent)).toBe(true);
    });
    it('not a minter admin can not change content', async () => {
        let newContent = beginCell().storeUint(1,1).endCell();
        let changeContent = await jettonMaster.sendChangeContent(notDeployer.getSender(), newContent);
        expect((await jettonMaster.getContent()).equals(defaultContent)).toBe(true);
        expect(changeContent.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: jettonMaster.address,
            aborted: true,
            exitCode: Errors.not_admin, // error::unauthorized_change_content_request
        });
    });

    it('wallet owner should be able to send jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        let initialTotalSupply = await jettonMaster.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), toNano('0.1'), //tons
               sentAmount, notDeployer.address,
               deployer.address, null, forwardAmount, null);
        expect(sendResult.transactions).toHaveTransaction({ //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });
        expect(sendResult.transactions).toHaveTransaction({ //notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address,
            value: forwardAmount
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2 + sentAmount);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply);
    });


    it('not wallet owner should not be able to send jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        let initialTotalSupply = await jettonMaster.getTotalSupply();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonBalance();
        let sentAmount = toNano('0.5');
        const sendResult = await deployerJettonWallet.sendTransfer(notDeployer.getSender(), toNano('0.1'), //tons
               sentAmount, notDeployer.address,
               deployer.address, null, toNano('0.05'), null);
        expect(sendResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_owner, //error::unauthorized_transfer
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2);
        expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('impossible to send too much jettons', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonBalance();
        let sentAmount = initialJettonBalance + 1n;
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), toNano('0.1'), //tons
               sentAmount, notDeployer.address,
               deployer.address, null, forwardAmount, null);
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.balance_error, //error::not_enough_jettons
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2);
    });

    it('correctly sends forward_payload', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = toNano('0.05');
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), toNano('0.1'), //tons
               sentAmount, notDeployer.address,
               deployer.address, null, forwardAmount, forwardPayload);
        expect(sendResult.transactions).toHaveTransaction({ //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });
        /*
        transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16)
                                      sender:MsgAddress forward_payload:(Either Cell ^Cell)
                                      = InternalMsgBody;
        */
        expect(sendResult.transactions).toHaveTransaction({ //notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address,
            value: forwardAmount,
            body: beginCell().storeUint(Op.transfer_notification, 32).storeUint(0, 64) //default queryId
                              .storeCoins(sentAmount)
                              .storeAddress(deployer.address)
                              .storeUint(1, 1)
                              .storeRef(forwardPayload)
                  .endCell()
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2 + sentAmount);
    });

    it('no forward_ton_amount - no forward', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        let initialJettonBalance2 = await notDeployerJettonWallet.getJettonBalance();
        let sentAmount = toNano('0.5');
        let forwardAmount = 0n;
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), toNano('0.1'), //tons
               sentAmount, notDeployer.address,
               deployer.address, null, forwardAmount, forwardPayload);
        expect(sendResult.transactions).toHaveTransaction({ //excesses
            from: notDeployerJettonWallet.address,
            to: deployer.address,
        });

        expect(sendResult.transactions).not.toHaveTransaction({ //no notification
            from: notDeployerJettonWallet.address,
            to: notDeployer.address
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - sentAmount);
        expect(await notDeployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2 + sentAmount);
    });

    it('check revert on not enough tons for forward', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
        await deployer.send({value:toNano('1'), bounce:false, to: deployerJettonWallet.address});
        let sentAmount = toNano('0.1');
        let forwardAmount = toNano('0.3');
        let forwardPayload = beginCell().storeUint(0x1234567890abcdefn, 128).endCell();
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), forwardAmount, // not enough tons, no tons for gas
               sentAmount, notDeployer.address,
               deployer.address, null, forwardAmount, forwardPayload);
        expect(sendResult.transactions).toHaveTransaction({
            from: deployer.address,
            on: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_enough_ton, //error::not_enough_tons
        });
        // Make sure value bounced
        expect(sendResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            on: deployer.address,
            inMessageBounced: true,
            success: true
        });

        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
    });

    // implementation detail
    // it('works with minimal ton amount', async () => {
    //     const deployerJettonWallet = await userWallet(deployer.address);
    //     let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
    //     const someAddress = Address.parse("EQD__________________________________________0vo");
    //     const someJettonWallet = await userWallet(someAddress);
    //     let initialJettonBalance2 = await someJettonWallet.getJettonBalance();
    //     await deployer.send({value:toNano('1'), bounce:false, to: deployerJettonWallet.address});
    //     let forwardAmount = toNano('0.3');
    //     /*
    //                  forward_ton_amount +
    //                  fwd_count * fwd_fee +
    //                  (2 * gas_consumption + min_tons_for_storage));
    //     */
    //     let minimalFee = 2n* fwd_fee + 2n*gas_consumption + min_tons_for_storage;
    //     let sentAmount = forwardAmount + minimalFee; // not enough, need >
    //     let forwardPayload = null;
    //     let tonBalance =(await blockchain.getContract(deployerJettonWallet.address)).balance;
    //     let tonBalance2 = (await blockchain.getContract(someJettonWallet.address)).balance;
    //     let sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), sentAmount,
    //            sentAmount, someAddress,
    //            deployer.address, null, forwardAmount, forwardPayload);
    //     expect(sendResult.transactions).toHaveTransaction({
    //         from: deployer.address,
    //         to: deployerJettonWallet.address,
    //         aborted: true,
    //         exitCode: Errors.not_enough_ton, //error::not_enough_tons
    //     });
    //     sentAmount += 1n; // now enough
    //     sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), sentAmount,
    //            sentAmount, someAddress,
    //            deployer.address, null, forwardAmount, forwardPayload);
    //     expect(sendResult.transactions).not.toHaveTransaction({ //no excesses
    //         from: someJettonWallet.address,
    //         to: deployer.address,
    //     });
     
    //     expect(sendResult.transactions).toHaveTransaction({ //notification
    //         from: someJettonWallet.address,
    //         to: someAddress,
    //         value: forwardAmount,
    //         body: beginCell().storeUint(Op.transfer_notification, 32).storeUint(0, 64) //default queryId
    //                           .storeCoins(sentAmount)
    //                           .storeAddress(deployer.address)
    //                           .storeUint(0, 1)
    //               .endCell()
    //     });
    //     expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - sentAmount);
    //     expect(await someJettonWallet.getJettonBalance()).toEqual(initialJettonBalance2 + sentAmount);

    //     tonBalance = (await blockchain.getContract(deployerJettonWallet.address)).balance;
    //     expect((await blockchain.getContract(someJettonWallet.address)).balance).toBeGreaterThan(min_tons_for_storage);
    // });

    // implementation detail
    it('wallet does not accept internal_transfer not from wallet', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
/*
  internal_transfer  query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
                     response_address:MsgAddress
                     forward_ton_amount:(VarUInteger 16)
                     forward_payload:(Either Cell ^Cell)
                     = InternalMsgBody;
*/
        let internalTransfer = beginCell().storeUint(0x178d4519, 32).storeUint(0, 64) //default queryId
                              .storeCoins(toNano('0.01'))
                              .storeAddress(deployer.address)
                              .storeAddress(deployer.address)
                              .storeCoins(toNano('0.05'))
                              .storeUint(0, 1)
                  .endCell();
        const sendResult = await blockchain.sendMessage(internal({
                    from: notDeployer.address,
                    to: deployerJettonWallet.address,
                    body: internalTransfer,
                    value:toNano('0.3')
                }));
        expect(sendResult.transactions).toHaveTransaction({
            from: notDeployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.not_valid_wallet, //error::unauthorized_incoming_transfer
        });
        expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
    });

    it('wallet owner should be able to burn jettons', async () => {
           const deployerJettonWallet = await userWallet(deployer.address);
            let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
            let initialTotalSupply = await jettonMaster.getTotalSupply();
            let burnAmount = toNano('0.01');
            const sendResult = await deployerJettonWallet.sendBurn(deployer.getSender(), toNano('0.1'), // ton amount
                                 burnAmount, deployer.address, null); // amount, response address, custom payload
            expect(sendResult.transactions).toHaveTransaction({ //burn notification
                from: deployerJettonWallet.address,
                to: jettonMaster.address
            });
            expect(sendResult.transactions).toHaveTransaction({ //excesses
                from: jettonMaster.address,
                to: deployer.address
            });
            expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - burnAmount);
            expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply - burnAmount);

    });

    it('not wallet owner should not be able to burn jettons', async () => {
              const deployerJettonWallet = await userWallet(deployer.address);
              let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
              let initialTotalSupply = await jettonMaster.getTotalSupply();
              let burnAmount = toNano('0.01');
              const sendResult = await deployerJettonWallet.sendBurn(notDeployer.getSender(), toNano('0.1'), // ton amount
                                    burnAmount, deployer.address, null); // amount, response address, custom payload
              expect(sendResult.transactions).toHaveTransaction({
                 from: notDeployer.address,
                 to: deployerJettonWallet.address,
                 aborted: true,
                 exitCode: Errors.not_owner, //error::unauthorized_transfer
                });
              expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
              expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply);
    });

    it('wallet owner can not burn more jettons than it has', async () => {
                const deployerJettonWallet = await userWallet(deployer.address);
                let initialJettonBalance = await deployerJettonWallet.getJettonBalance();
                let initialTotalSupply = await jettonMaster.getTotalSupply();
                let burnAmount = initialJettonBalance + 1n;
                const sendResult = await deployerJettonWallet.sendBurn(deployer.getSender(), toNano('0.1'), // ton amount
                                        burnAmount, deployer.address, null); // amount, response address, custom payload
                expect(sendResult.transactions).toHaveTransaction({
                     from: deployer.address,
                     to: deployerJettonWallet.address,
                     aborted: true,
                     exitCode: Errors.balance_error, //error::not_enough_jettons
                    });
                expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance);
                expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply);
    });

    // it('minimal burn message fee', async () => {
    //    const deployerJettonWallet = await userWallet(deployer.address);
    //    let initialJettonBalance   = await deployerJettonWallet.getJettonBalance();
    //    let initialTotalSupply     = await jettonMaster.getTotalSupply();
    //    let burnAmount   = toNano('0.01');
    //    let fwd_fee      = 1492012n /*1500012n*/, gas_consumption = 15000000n;
    //    let minimalFee   = fwd_fee + 2n*gas_consumption;

    //    const sendLow    = await deployerJettonWallet.sendBurn(deployer.getSender(), minimalFee, // ton amount
    //                         burnAmount, deployer.address, null); // amount, response address, custom payload

    //    expect(sendLow.transactions).toHaveTransaction({
    //             from: deployer.address,
    //             to: deployerJettonWallet.address,
    //             aborted: true,
    //             exitCode: Errors.not_enough_gas, //error::burn_fee_not_matched
    //          });

    //     const sendExcess = await deployerJettonWallet.sendBurn(deployer.getSender(), minimalFee + 1n,
    //                                                                   burnAmount, deployer.address, null);

    //     expect(sendExcess.transactions).toHaveTransaction({
    //         from: deployer.address,
    //         to: deployerJettonWallet.address,
    //         success: true
    //     });

    //     expect(await deployerJettonWallet.getJettonBalance()).toEqual(initialJettonBalance - burnAmount);
    //     expect(await jettonMaster.getTotalSupply()).toEqual(initialTotalSupply - burnAmount);

    // });

    it('minter should only accept burn messages from jetton wallets', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        const burnAmount = toNano('1');
        const burnNotification = (amount: bigint, addr: Address) => {
        return beginCell()
                .storeUint(Op.burn_notification, 32)
                .storeUint(0, 64)
                .storeCoins(amount)
                .storeAddress(addr)
                .storeAddress(deployer.address)
               .endCell();
        }

        let res = await blockchain.sendMessage(internal({
            from: deployerJettonWallet.address,
            to: jettonMaster.address,
            body: burnNotification(burnAmount, randomAddress(0)),
            value: toNano('0.1')
        }));

        expect(res.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMaster.address,
            aborted: true,
            exitCode: Errors.unouthorized_burn // Unauthorized burn
        });

        res = await blockchain.sendMessage(internal({
            from: deployerJettonWallet.address,
            to: jettonMaster.address,
            body: burnNotification(burnAmount, deployer.address),
            value: toNano('0.1')
        }));

        expect(res.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: jettonMaster.address,
            success: true
        });
   });

    // TEP-89
    it('report correct discovery address', async () => {
        let discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(), deployer.address, true);
        /*
          take_wallet_address#d1735400 query_id:uint64 wallet_address:MsgAddress owner_address:(Maybe ^MsgAddress) = InternalMsgBody;
        */
        const deployerJettonWallet = await userWallet(deployer.address);
        expect(discoveryResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            body: beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                              .storeAddress(deployerJettonWallet.address)
                              .storeUint(1, 1)
                              .storeRef(beginCell().storeAddress(deployer.address).endCell())
                  .endCell()
        });

        discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(), notDeployer.address, true);
        const notDeployerJettonWallet = await userWallet(notDeployer.address);
        expect(discoveryResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            body: beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                              .storeAddress(notDeployerJettonWallet.address)
                              .storeUint(1, 1)
                              .storeRef(beginCell().storeAddress(notDeployer.address).endCell())
                  .endCell()
        });

        // do not include owner address
        discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(), notDeployer.address, false);
        expect(discoveryResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            body: beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                              .storeAddress(notDeployerJettonWallet.address)
                              .storeUint(0, 1)
                  .endCell()
        });

    });

    // it('Minimal discovery fee', async () => {
    //    // 5000 gas-units + msg_forward_prices.lump_price + msg_forward_prices.cell_price = 0.0061
    //     const fwdFee     = 1464012n;
    //     const minimalFee = fwdFee + 10000000n; // toNano('0.0061');

    //     let discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(),
    //                                                                   notDeployer.address,
    //                                                                   false,
    //                                                                   minimalFee);

    //     expect(discoveryResult.transactions).toHaveTransaction({
    //         from: deployer.address,
    //         to: jettonMaster.address,
    //         aborted: true,
    //         exitCode: Errors.discovery_fee_not_matched // discovery_fee_not_matched
    //     });

    //     /*
    //      * M ight be helpfull to have logical OR in expect lookup
    //      * Because here is what is stated in standard:
    //      * and either throw an exception if amount of incoming value is not enough to calculate wallet address
    //      * or response with message (sent with mode 64)
    //      * https://github.com/ton-blockchain/TEPs/blob/master/text/0089-jetton-wallet-discovery.md
    //      * At least something like
    //      * expect(discoveryResult.hasTransaction({such and such}) ||
    //      * discoveryResult.hasTransaction({yada yada})).toBeTruethy()
    //      */
    //     discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(),
    //                                                        notDeployer.address,
    //                                                        false,
    //                                                        minimalFee + 1n);

    //     expect(discoveryResult.transactions).toHaveTransaction({
    //         from: deployer.address,
    //         to: jettonMaster.address,
    //         success: true
    //     });

    // });

    it('Correctly handles not valid address in discovery', async () =>{
        const badAddr       = randomAddress(-1);
        let discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(),
                                                               badAddr,
                                                               false);

        expect(discoveryResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            body: beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                             .storeUint(0, 2) // addr_none
                             .storeUint(0, 1)
                  .endCell()

        });

        // Include address should still be available

        discoveryResult = await jettonMaster.sendDiscovery(deployer.getSender(),
                                                           badAddr,
                                                           true); // Include addr

        expect(discoveryResult.transactions).toHaveTransaction({
            from: jettonMaster.address,
            to: deployer.address,
            body: beginCell().storeUint(Op.take_wallet_address, 32).storeUint(0, 64)
                             .storeUint(0, 2) // addr_none
                             .storeUint(1, 1)
                             .storeRef(beginCell().storeAddress(badAddr).endCell())
                  .endCell()

        });
    });

    it('can not send to masterchain', async () => {
        const deployerJettonWallet = await userWallet(deployer.address);
        let sentAmount = toNano('0.5');
        let forwardAmount = toNano('0.05');
        const sendResult = await deployerJettonWallet.sendTransfer(deployer.getSender(), toNano('0.1'), //tons
               sentAmount, Address.parse("Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU"),
               deployer.address, null, forwardAmount, null);
        expect(sendResult.transactions).toHaveTransaction({ //excesses
            from: deployer.address,
            to: deployerJettonWallet.address,
            aborted: true,
            exitCode: Errors.wrong_workchain //error::wrong_workchain
        });
    });
    describe('Bounces', () => {
        // This is borrowed from stablecoin, and is not implemented here.
        // Should it be implemented?
        it.skip('minter should restore supply on internal_transfer bounce', async () => {
            const deployerJettonWallet    = await userWallet(deployer.address);
            const mintAmount = BigInt(getRandomInt(1000, 2000));
            const mintMsg    = JettonMaster.mintMessage(jettonMaster.address, deployer.address, mintAmount,toNano('0.1'), toNano('0.1'));

            const supplyBefore = await jettonMaster.getTotalSupply();
            const minterSmc    = await blockchain.getContract(jettonMaster.address);

            // Sending message but only processing first step of tx chain
            let res = await minterSmc.receiveMessage(internal({
                from: deployer.address,
                to: jettonMaster.address,
                body: mintMsg,
                value: toNano('1')
            }));

            expect(res.outMessages).toEqual(1);
            const outMsgSc = res.outMessages.get(0)!.body.beginParse();
            expect(outMsgSc.preloadUint(32)).toEqual(Op.internal_transfer);

            expect(await jettonMaster.getTotalSupply()).toEqual(supplyBefore + mintAmount);

            minterSmc.receiveMessage(internal({
                from: deployerJettonWallet.address,
                to: jettonMaster.address,
                bounced: true,
                body: beginCell().storeUint(0xFFFFFFFF, 32).storeSlice(outMsgSc).endCell(),
                value: toNano('0.95')
            }));

            // Supply should change back
            expect(await jettonMaster.getTotalSupply()).toEqual(supplyBefore);
        });
        it('wallet should restore balance on internal_transfer bounce', async () => {
            const deployerJettonWallet    = await userWallet(deployer.address);
            const notDeployerJettonWallet = await userWallet(notDeployer.address);
            const balanceBefore           = await deployerJettonWallet.getJettonBalance();
            const txAmount = BigInt(getRandomInt(100, 200));
            const transferMsg = JettonWallet.transferMessage(txAmount, notDeployer.address, deployer.address, null, 0n, null);

            const walletSmc = await blockchain.getContract(deployerJettonWallet.address);

            const res = await walletSmc.receiveMessage(internal({
                from: deployer.address,
                to: deployerJettonWallet.address,
                body: transferMsg,
                value: toNano('1')
            }));

            expect(res.outMessagesCount).toEqual(1);

            const outMsgSc = res.outMessages.get(0)!.body.beginParse();
            expect(outMsgSc.preloadUint(32)).toEqual(Op.internal_transfer);

            expect(await deployerJettonWallet.getJettonBalance()).toEqual(balanceBefore - txAmount);

            walletSmc.receiveMessage(internal({
                from: notDeployerJettonWallet.address,
                to: walletSmc.address,
                bounced: true,
                body: beginCell().storeUint(0xFFFFFFFF, 32).storeSlice(outMsgSc).endCell(),
                value: toNano('0.95')
            }));

            // Balance should roll back
            expect(await deployerJettonWallet.getJettonBalance()).toEqual(balanceBefore);
        });
        it('wallet should restore balance on burn_notification bounce', async () => {
            const deployerJettonWallet = await userWallet(deployer.address);
            const balanceBefore        = await deployerJettonWallet.getJettonBalance();
            const burnAmount = BigInt(getRandomInt(100, 200));

            const burnMsg = JettonWallet.burnMessage(burnAmount, deployer.address, null);

            const walletSmc = await blockchain.getContract(deployerJettonWallet.address);

            const res = await walletSmc.receiveMessage(internal({
                from: deployer.address,
                to: deployerJettonWallet.address,
                body: burnMsg,
                value: toNano('1')
            }));

            expect(res.outMessagesCount).toEqual(1);

            const outMsgSc = res.outMessages.get(0)!.body.beginParse();
            expect(outMsgSc.preloadUint(32)).toEqual(Op.burn_notification);

            expect(await deployerJettonWallet.getJettonBalance()).toEqual(balanceBefore - burnAmount);

            walletSmc.receiveMessage(internal({
                from: jettonMaster.address,
                to: walletSmc.address,
                bounced: true,
                body: beginCell().storeUint(0xFFFFFFFF, 32).storeSlice(outMsgSc).endCell(),
                value: toNano('0.95')
            }));

            // Balance should roll back
            expect(await deployerJettonWallet.getJettonBalance()).toEqual(balanceBefore);
        });
    });

    
});