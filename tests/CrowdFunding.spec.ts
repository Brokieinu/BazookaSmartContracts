import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Cell,beginCell,Address,TransactionComputeVm, TransactionDescriptionGeneric, toNano } from '@ton/core';
import { CrowdFunding,errorCodes } from '../wrappers/CrowdFundingWrapper';
import { JettonMaster, jettonContentToCell } from '../wrappers/JettonMaster';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { DepositBill } from '../wrappers/DepositBill';
import { Opcodes } from '../helpers/Opcodes';
import {log} from 'console';
import Decimal from 'decimal.js';


let start_time = 1727106691;
let duration = 20 * 60 * 1000;
let end_time = start_time + duration
let individual_limit = toNano(1000);
let soft_cap = toNano(10000)
let total_cap_raised = toNano(0);
let jetton_total_supply = toNano(1000000000)
let tokens_for_presale = toNano(350000000)
let liquidity_percent = 50;
let soft_halt = 0;


describe('funds raising in ton', () => {
    let depositCode: Cell;
    let depositBillCode:Cell;
    let jettonWalletCode:Cell;
    let blockchain: Blockchain;
    let testDeposit: SandboxContract<CrowdFunding>;
    let depositBill: SandboxContract<DepositBill>;
    let user:SandboxContract<TreasuryContract>;
    let project_owner:SandboxContract<TreasuryContract>
    let platform_address:SandboxContract<TreasuryContract>
    let admin:SandboxContract<TreasuryContract>
    let jwallet_code = new Cell();
    let master_code = new Cell();
    let user1:SandboxContract<TreasuryContract>;
    let jettonMaster:SandboxContract<JettonMaster>;
    let jettonWalletForTxn:any;
    let defaultContent:Cell;
    let lockSmartContractAddr:SandboxContract<TreasuryContract>;
    let deployJetton;
    let deployCrowdFunding;
    let deployJettonAddress:Address;



    beforeEach(async () => {
        depositCode = await compile('CrowdFunding');
        depositBillCode = await compile("DepositBill");
        jwallet_code = await compile('JettonWallet');
        master_code = await compile("JettonMaster");
        blockchain = await Blockchain.create();
        project_owner = await blockchain.treasury('project_owner')
        admin = await blockchain.treasury('admin')
        user = await blockchain.treasury('user',{balance:toNano(100000)});
        user1 = await blockchain.treasury('user1',{balance:toNano(100000)})
        platform_address = await blockchain.treasury('platform_address')
        lockSmartContractAddr = await blockchain.treasury('lock_smart_contract_address')
        defaultContent = jettonContentToCell({type:1,uri:"https://testjetton.org/content.json"});

        // Deploy Jetton master smart contract

        jettonMaster = blockchain.openContract(
          JettonMaster.createFromConfig({
            totalSupply:jetton_total_supply,
            admin:admin.address,
            content:defaultContent,
            wallet_code:jwallet_code,
          },
          master_code
        )
        )

    deployJetton = await jettonMaster.sendDeploy(admin.getSender(),toNano('0.1'));


        jettonWalletForTxn = async(address:Address) => blockchain.openContract(
          JettonWallet.createFromAddress(
            await jettonMaster.getWalletAddress(address)
          )
        )

        // const exampleAddress = Address.parse("UQBg_HxD38JPiIzi6oiN7M0xLBbfUhUepWtdkkG429p6LOFL")
        // const jetton_wallet_cell = beginCell().storeAddress(exampleAddress).endCell();

        // Crowdfunding smart contract deployment
        testDeposit = blockchain.openContract(CrowdFunding.createFromConfig({
          admin_address:admin.address,
          jetton_address:jettonMaster.address,
          start_time:start_time,
          end_time:end_time,
          individual_limit:BigInt(toNano(1000)),
          soft_cap:BigInt(toNano(10000)),
          total_cap_raised:BigInt(toNano(0)),
          tokens_for_presale:tokens_for_presale,
          liquidity_percent:liquidity_percent,
          is_liquidy_withdrawn:0,
          is_commission_withdrawn:0,
          soft_halt:0,
          jetton_wallet_code:jwallet_code,
          billCode:depositBillCode
        },
        depositCode
      ))
    
      // deposit bill smart contract for user
      depositBill = blockchain.openContract(DepositBill.createFromConfig({
        funding_contract_address:testDeposit.address,
        userAddress:user.address,
        individual_limit
      },
      depositBillCode
    ))

     deployJettonAddress = await jettonMaster.getWalletAddress(testDeposit.address);

     log(`depoy jetton wallet address: ${deployJettonAddress}`)

    const setJettonWalletCell = beginCell().storeAddress(deployJettonAddress).endCell();

    deployCrowdFunding = await testDeposit.sendDeploy(admin.getSender(),toNano('0.05'),setJettonWalletCell);

    printTransactionFees(deployCrowdFunding.transactions);

    });
  
  

it("should set correct admin address",async()=>{
      const admin = await blockchain.treasury('admin')
      const get_admin = await testDeposit.getAdmin()
      expect(get_admin).toEqualAddress(admin.address);
    })

it("admin should be able to change admin",async()=>{
      const admin = await blockchain.treasury('admin');
      const new_admin = await blockchain.treasury('new_admin')
      const changeAdminTxn = await testDeposit.sendChangeAdmin(admin.getSender(),{
        value:toNano(0.05),address:new_admin.address
      })
      
      const getNewAdmin = await testDeposit.getAdmin();

      expect(getNewAdmin).toEqualAddress(new_admin.address);
    })


it("should set correct jetton address",async()=>{
      const public_data = await testDeposit.getDepositPublicData();
      log(`public data: `,public_data);
      const jetton_address_on_contract = public_data.jetton_address;
      log(`Jetton address: `,jetton_address_on_contract);

      expect(jettonMaster.address).toEqualAddress(jetton_address_on_contract)
    })

it("should allow anyone to deposit ton",async()=>{
      // check initial states of crowdfunding smart contract
      // initially the total cap raised should be 0
      const total_cap_raise_before = await testDeposit.getTotalCapRaised();
      expect(total_cap_raise_before).toBe(toNano(0));

      const user_1_amount_to_invest = toNano('100')

      // Deposit opcode call to crowdfundin smart by user.
      const depositResult = await testDeposit.sendDeposit(user.getSender(),{
        value:user_1_amount_to_invest
      })

      expect(depositResult.transactions).toHaveTransaction({
        from:testDeposit.address,
        to:depositBill.address,
        success:true,
      })

      const balance:bigint = await testDeposit.getContractBalance();
      log(`Balance: ${balance}`);

      const parseBalance = new Decimal(balance.toString())

      // log(`ContractData: `,contractdata);
      const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
      // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

      log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
      log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

      const billData = await depositBill.getDepositBillData();
      log(`invested amount by user: ${billData.total_coins_deposited}`);
      expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
      expect(billData.individual_limit).toBe(individual_limit);
      expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
      expect(billData.user_addres.toString()).toBe(user.address.toString());

      // Deposit transactions gas fee summary
      printTransactionFees(depositResult.transactions);
    })

it("should not allow anyone to deposit more than individual limit",async()=>{
      // check initial states of crowdfunding smart contract
      // initially the total cap raised should be 0
      const total_cap_raise_before = await testDeposit.getTotalCapRaised();
      expect(total_cap_raise_before).toBe(toNano(0));

      const user_1_amount_to_invest = toNano('1000')

      // Deposit opcode call to crowdfundin smart by user.
      const depositResult = await testDeposit.sendDeposit(user.getSender(),{
        value:user_1_amount_to_invest
      })

      const getData = await testDeposit.getDepositPublicData();
      log(`Softcap: ${getData['soft_cap']}`);


      expect(depositResult.transactions).toHaveTransaction({
        from:testDeposit.address,
        to:depositBill.address,
        success:true,
      })

      const balance:bigint = await testDeposit.getContractBalance();
      log(`Balance: ${balance}`);

      const parseBalance = new Decimal(balance.toString())

      // log(`ContractData: `,contractdata);
      const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
      // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

      log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
      log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

      const billData = await depositBill.getDepositBillData();
      log(`invested amount by user: ${billData.total_coins_deposited}`);
      expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
      expect(billData.individual_limit).toBe(individual_limit);
      expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
      expect(billData.user_addres.toString()).toBe(user.address.toString());

      // Deposit transactions gas fee summary
      printTransactionFees(depositResult.transactions);

      // second deposit

      const total_cap_raise_before_2 = await testDeposit.getTotalCapRaised();
      expect(total_cap_raise_before_2).toBe(toNano(1000));


      // Deposit opcode call to crowdfundin smart by user.
      const depositResult2 = await testDeposit.sendDeposit(user.getSender(),{
        value:user_1_amount_to_invest
      })

      expect(depositResult2.transactions).toHaveTransaction({
        from:testDeposit.address,
        to:depositBill.address,
        success:true,
        // exitCode:103
      })

      const balance2:bigint = await testDeposit.getContractBalance();
      log(`Balance: ${balance2}`);

      const parseBalance2 = new Decimal(balance2.toString())

      // log(`ContractData: `,contractdata);
      const get_total_cap_raised_after2 = await testDeposit.getTotalCapRaised();
      // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

      log(`Balance of smart contract after individual limit error:: ${parseBalance2.div(10**9)}`);
      log(`total cap raised loged on smart contract after individual limit error : ${get_total_cap_raised_after2}`)

      const billData2 = await depositBill.getDepositBillData();

      log(`invested amount by user after limit violation: ${billData2.total_coins_deposited}`);
      expect(billData2.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
      expect(billData2.individual_limit).toBe(individual_limit);
      expect(billData2.total_coins_deposited).toBe(individual_limit);
      expect(billData2.user_addres.toString()).toBe(user.address.toString());
      
      // Deposit transactions gas fee summary
      console.log(`transaction of individual limit violation: `)
      printTransactionFees(depositResult2.transactions);
    })

it("should not allow investor to invest below minimum required amount  ",async()=>{
      // check initial states of crowdfunding smart contract
      // initially the total cap raised should be 0
      const total_cap_raise_before = await testDeposit.getTotalCapRaised();
      expect(total_cap_raise_before).toBe(toNano(0));

      const user_1_amount_to_invest = toNano('2')

      // Deposit opcode call to crowdfundin smart by user.
      const depositResult = await testDeposit.sendDeposit(user.getSender(),{
        value:user_1_amount_to_invest
      })

      expect(depositResult.transactions).toHaveTransaction({
        from:user.address,
        to:testDeposit.address,
        success:false,
        exitCode:600
      })

      const balance:bigint = await testDeposit.getContractBalance();
      log(`Balance: ${balance}`);

      const parseBalance = new Decimal(balance.toString())

      // log(`ContractData: `,contractdata);
      const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
      // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

      log(`Balance of smart contract on first deposit limit invalidation: ${parseBalance.div(10**9)}`);
      log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

      // Deposit transactions gas fee summary
      printTransactionFees(depositResult.transactions);
    })    

it("should allow investor to withdraw investment if soft cap fails",async()=>{
        const total_cap_raise_before = await testDeposit.getTotalCapRaised();
        expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

        const user_1_amount_to_invest = toNano('10')

        // Deposit opcode call to crowdfunding investment first time
        const depositResult = await testDeposit.sendDeposit(user.getSender(),{
          value:user_1_amount_to_invest
        })

        expect(depositResult.transactions).toHaveTransaction({
          from:testDeposit.address,
          to:depositBill.address,
          success:true,
        })

        const balance:bigint = await testDeposit.getContractBalance();
        log(`Balance: ${balance}`);

        const parseBalance = new Decimal(balance.toString())

        // log(`ContractData: `,contractdata);
        const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
        // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

        log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
        log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

        const billData = await depositBill.getDepositBillData();
        log(`invested amount by user: ${billData.total_coins_deposited}`);
        expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
        expect(billData.individual_limit).toBe(individual_limit);
        expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
        expect(billData.user_addres.toString()).toBe(user.address.toString());

        // Deposit transactions gas fee summary
        printTransactionFees(depositResult.transactions);

      // invest again
      const userInvest2 = await testDeposit.sendDeposit(user.getSender(),{
        value:toNano(1)
      })
      
        blockchain.now = end_time + 20;

      // checking user balance before withdrawal request.
      const user_balance_before = await user.getBalance();
      log(`user balance before withdrawal: `,user_balance_before);

      // Withdraw opcode call to crowdfunding smart contract.
      const investorWithdrawal = await testDeposit.sendInvestorWithdrawalReq(user.getSender(),{
        value:toNano(0.05)
      })

      const user_balance_after_withdrawal = await user.getBalance();
      log(`user balance after withdrawal: ${user_balance_after_withdrawal}`);

      const contract_balance_after_withdrawal = await testDeposit.getContractBalance();
      log(`crowdfunding smart contract balance after withdrawal: ${contract_balance_after_withdrawal}`);

      const userBillBalance = await depositBill.getDepositBillBalance();
      log(`Deposit contract balance after withdrawal: `,userBillBalance);

      // verifying users bill smart contract states.
      const checkIfUserDepositWithdrawalSuccessfull = await depositBill.getIsDepositWithdrawn();
      expect(checkIfUserDepositWithdrawalSuccessfull).toBeTruthy();

      // withdraw request transaction log
      log('withdraw transaction log : ')
      printTransactionFees(investorWithdrawal.transactions);
})

it("should not allow investor to withdraw investment if already withdrawn",async()=>{
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('100')

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  printTransactionFees(depositResult.transactions);
  blockchain.now = end_time + 20;

// checking user balance before withdrawal request.
const user_balance_before = await user.getBalance();
log(`user balance before withdrawal: `,user_balance_before);

// Withdraw opcode call to crowdfunding smart contract.
const investorWithdrawal = await testDeposit.sendInvestorWithdrawalReq(user.getSender(),{
  value:toNano(0.05)
})

const user_balance_after_withdrawal = await user.getBalance();
log(`user balance after withdrawal: ${user_balance_after_withdrawal}`);

const contract_balance_after_withdrawal = await testDeposit.getContractBalance();
log(`user balance after withdrawal: ${contract_balance_after_withdrawal}`);

// verifying users bill smart contract states.
const checkIfUserDepositWithdrawalSuccessfull = await depositBill.getIsDepositWithdrawn();
expect(checkIfUserDepositWithdrawalSuccessfull).toBeTruthy();

// withdraw request transaction log
log('withdraw transaction log : ')
printTransactionFees(investorWithdrawal.transactions);

// Double withrawal:
  const double_withdrawal = await testDeposit.sendInvestorWithdrawalReq(user.getSender(),{
    value:toNano(0.05)
  });
  expect(double_withdrawal.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:false,
    exitCode:9
  })
  expect(await depositBill.getIsDepositWithdrawn()).toBeTruthy();

})

it("should allow admin to withdraw commission and liquidity allocation if soft cap is acheived",async()=>{
  log(`COMMISSION and Liquidity WITHDRAWAL: `);
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('1000');

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest );
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  // printTransactionFees(depositResult.transactions);
  
  blockchain.now = end_time + 20;
  // try to withdraw

  const _softCap = new Decimal(soft_cap.toString());

  const liquidityAllocation = _softCap.mul(liquidity_percent).div(100);

  log(`liquidity allocation ${liquidityAllocation}`);

  const adminBalanceBefore = await admin.getBalance();

  log(`Admins balance before ${adminBalanceBefore.toString()}`);

  const platform_address = await blockchain.treasury('platform_address',{balance:toNano(0)});

  // const withdrawLiquidityByAdmin = await testDeposit.sendWithdrawLiquidity(admin.getSender(),{
  //   value:toNano(0.05)
  // });

  // log(`liquidity claim successfull : `)
  // printTransactionFees(withdrawLiquidityByAdmin.transactions);

  log(`Withdraw log`)
  const withdrawCommsionByAdmin = await testDeposit.sendWithdrawCommision(admin.getSender(),{
    value:toNano(0.05),platform_address:platform_address.address
  });

  // const adminBalanceAfter = await admin.getBalance();

  log(`platform balance after commision withdrawal: ${await platform_address.getBalance()}`);

  printTransactionFees(withdrawCommsionByAdmin.transactions);

}) 


it("should not allow investor to withdraw investment if soft cap is acheived",async()=>{
  log(`SHOULD NOT ALLOW WITHDRAWAL`);
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));
  const users = await blockchain.createWallets(10);

  const amount_to_invest = toNano('1000');

  for(let i = 0; i < 10; i++){
    await testDeposit.sendDeposit(users[i].getSender(),{
      value:amount_to_invest
    })
  }

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  
  blockchain.now = end_time + 20;
  // try to withdraw

  const getting_total_cap_raised = await testDeposit.getTotalCapRaised();
  log(`total cap raise: ${getting_total_cap_raised}`)


  const cbalance = await testDeposit.getContractBalance();
  log(`contract balance: ${cbalance}`)


  const investor1_withdraw_req = await testDeposit.sendInvestorWithdrawalReq(users[1].getSender(),{
    value:toNano(0.05)
  })

  log(`This is deposit contract address: ${testDeposit.address}`)
  log(`this is users address: ${users[1].address}`)

  printTransactionFees(investor1_withdraw_req.transactions);

  expect(investor1_withdraw_req.transactions).toHaveTransaction({
    from:users[1].address,
    to:testDeposit.address,
    success:false,
    exitCode:511
  })
}) 


it("should mint jettons",async()=>{
  // Minting jettons
  log(`Minting Transaction: `)
  const mintTxn = await jettonMaster.sendMint(admin.getSender(),admin.address,jetton_total_supply,toNano('0.05'),toNano('1'));
  const adminJettonWallet = await jettonWalletForTxn(admin.address);

  expect(mintTxn.transactions).toHaveTransaction({
    from:jettonMaster.address,
    to:adminJettonWallet.address,
    deploy:true
  })

  const adminJettonBalance = await adminJettonWallet.getJettonBalance();
  expect(adminJettonBalance).toBe(jetton_total_supply)
  
  printTransactionFees(mintTxn.transactions);
})

it("Admin should be able to deposit jettons",async()=>{
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('1000');

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  printTransactionFees(depositResult.transactions);

  log(`Minting Transaction: `)
  const mintTxn = await jettonMaster.sendMint(admin.getSender(),admin.address,jetton_total_supply,toNano('0.05'),toNano('1'));
  const adminJettonWallet = await jettonWalletForTxn(admin.address);

  expect(mintTxn.transactions).toHaveTransaction({
    from:jettonMaster.address,
    to:adminJettonWallet.address,
    deploy:true
  })

  const adminJettonBalance = await adminJettonWallet.getJettonBalance();
  expect(adminJettonBalance).toBe(jetton_total_supply)
  
  printTransactionFees(mintTxn.transactions);

  const depositContractJettonWallet = await jettonWalletForTxn(testDeposit.address);

  const depositContractJettonBalanceBefore = await depositContractJettonWallet.getJettonBalance();
  expect(depositContractJettonBalanceBefore).toBe(toNano(0));


  const depositJettonsToCf = await adminJettonWallet.sendTransfer(admin.getSender(),toNano(0.1),tokens_for_presale,testDeposit.address,admin.address,null,toNano(0.05),null);


  printTransactionFees(depositJettonsToCf.transactions);

  const depositContractJettonBalanceAfter = await depositContractJettonWallet.getJettonBalance();

  expect(depositContractJettonBalanceAfter).toBe(tokens_for_presale)
})

it("investor should be able to claim jettons",async()=>{
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('1000') ;

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  printTransactionFees(depositResult.transactions);

  log(`Minting Transaction: `)
  const mintTxn = await jettonMaster.sendMint(admin.getSender(),admin.address,jetton_total_supply,toNano('0.05'),toNano('1'));
  const adminJettonWallet = await jettonWalletForTxn(admin.address);

  expect(mintTxn.transactions).toHaveTransaction({
    from:jettonMaster.address,
    to:adminJettonWallet.address,
    deploy:true
  })

  const adminJettonBalance = await adminJettonWallet.getJettonBalance();
  expect(adminJettonBalance).toBe(jetton_total_supply)
  
  printTransactionFees(mintTxn.transactions);

  const depositContractJettonWallet = await jettonWalletForTxn(testDeposit.address);

  const depositContractJettonBalanceBefore = await depositContractJettonWallet.getJettonBalance();
  expect(depositContractJettonBalanceBefore).toBe(toNano(0));

  // let contractJettonWalletAddress = await testDeposit.getDepositJettonWallet();
  // log(`contract Jetton wallet address :${contractJettonWalletAddress} `);


  const depositJettonsToCf = await adminJettonWallet.sendTransfer(admin.getSender(),toNano(0.1),tokens_for_presale,testDeposit.address,admin.address,null,toNano(0.05),null);


  printTransactionFees(depositJettonsToCf.transactions);

  const depositContractJettonBalanceAfter = await depositContractJettonWallet.getJettonBalance();

  expect(depositContractJettonBalanceAfter).toBe(tokens_for_presale)

  blockchain.now = end_time + 20;

  const userBalanceBeforeJettonClaim = await user.getBalance();

  log(`User balance before jetton claim: `,userBalanceBeforeJettonClaim);

  const jettonClaimReq = await testDeposit.sendInvestorJettonClaimReq(user.getSender(),{
    value:toNano('0.1')
  })

  const userBalanceAfterJettonClaim = await user.getBalance();
  log(`User balance before jetton claim: `,userBalanceAfterJettonClaim);
  


  // const userBillContractBalance = await depositBill.getDepositBillBalance();
  // log(`user deposit bill contract balance after jetton claim: `,userBillContractBalance);

  printTransactionFees(jettonClaimReq.transactions);

  const user1JettonWallet = await jettonWalletForTxn(user.address);
  const userJettonBalance = await user1JettonWallet.getJettonBalance();
  log(`user 1 jetton balance: ${userJettonBalance}`);

  const contractBalanceAfterClaim = await depositContractJettonWallet.getJettonBalance();
  log(`jetton balance after claim: ${contractBalanceAfterClaim}`)

  const contractTonBalance = await testDeposit.getContractBalance();
  log(`contract balance after user completes jetton claim : ${contractTonBalance}`);
})

it('Should transfer remaining balance to project creator',async()=>{

  log(`Transfer remaining TONs to project creator`)

  // flow to raise funds and claim liquidity and commission allocation
  log(`COMMISSION and Liquidity WITHDRAWAL: `);
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('1000');

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest );
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  printTransactionFees(depositResult.transactions);
  
  blockchain.now = end_time + 20;
  // try to withdraw

  const _softCap = new Decimal(soft_cap.toString());

  const liquidityAllocation = _softCap.mul(liquidity_percent).div(100);

  log(`liquidity allocation ${liquidityAllocation}`);

  const adminBalanceBefore = await admin.getBalance();

  log(`Admins balance before ${adminBalanceBefore.toString()}`);

  const platform_address = await blockchain.treasury('platform_address',{balance:toNano(0)});

  const withdrawLiquidityByAdmin = await testDeposit.sendWithdrawLiquidity(admin.getSender(),{
    value:toNano(0.05)
  });

  log(`liquidity claim successfull : `)
  printTransactionFees(withdrawLiquidityByAdmin.transactions);

  const withdrawCommsionByAdmin = await testDeposit.sendWithdrawCommision(admin.getSender(),{
    value:toNano(0.05),platform_address:platform_address.address
  });

  // const adminBalanceAfter = await admin.getBalance();

  log(`platform balance after commision withdrawal: ${await platform_address.getBalance()}`);

  printTransactionFees(withdrawCommsionByAdmin.transactions);

  const projectCreatorWallet = await blockchain.treasury("projectCreator",{balance:toNano(0)})
  
  const withdrawToProjectCreator = await testDeposit.sendCreatorFunds(admin.getSender(),{
    value:toNano('0.05'),creator_address:projectCreatorWallet.address
  })

  printTransactionFees(withdrawToProjectCreator.transactions);
  
})

it("Admin Jettons and tons withdrawal from crowdfunding smart contract on soft halt",async()=>{
  const total_cap_raise_before = await testDeposit.getTotalCapRaised();
  expect(total_cap_raise_before).toBeLessThanOrEqual(toNano(0));

  const user_1_amount_to_invest = toNano('1000') ;

  // Deposit opcode call to crowdfundin smart by user.
  const depositResult = await testDeposit.sendDeposit(user.getSender(),{
    value:user_1_amount_to_invest
  })

  expect(depositResult.transactions).toHaveTransaction({
    from:testDeposit.address,
    to:depositBill.address,
    success:true,
  })

  const balance:bigint = await testDeposit.getContractBalance();
  log(`Balance: ${balance}`);

  const parseBalance = new Decimal(balance.toString())

  // log(`ContractData: `,contractdata);
  const get_total_cap_raised_after = await testDeposit.getTotalCapRaised();
  // expect(get_total_cap_raised_after).toBeGreaterThanOrEqual(balance);

  log(`Balance of smart contract on first deposit: ${parseBalance.div(10**9)}`);
  log(`total cap raised loged on smart contract after first deposit : ${get_total_cap_raised_after}`)

  const billData = await depositBill.getDepositBillData();
  log(`invested amount by user: ${billData.total_coins_deposited}`);
  expect(billData.fundraising_contract_address.toString()).toBe(testDeposit.address.toString());
  expect(billData.individual_limit).toBe(individual_limit);
  expect(billData.total_coins_deposited).toBe(user_1_amount_to_invest);
  expect(billData.user_addres.toString()).toBe(user.address.toString());

  // Deposit transactions gas fee summary
  printTransactionFees(depositResult.transactions);

  log(`Minting Transaction: `)
  const mintTxn = await jettonMaster.sendMint(admin.getSender(),admin.address,jetton_total_supply,toNano('0.05'),toNano('1'));
  const adminJettonWallet = await jettonWalletForTxn(admin.address);

  expect(mintTxn.transactions).toHaveTransaction({
    from:jettonMaster.address,
    to:adminJettonWallet.address,
    deploy:true
  })

  const adminJettonBalance = await adminJettonWallet.getJettonBalance();
  expect(adminJettonBalance).toBe(jetton_total_supply)
  
  printTransactionFees(mintTxn.transactions);

  const depositContractJettonWallet = await jettonWalletForTxn(testDeposit.address);

  const depositContractJettonBalanceBefore = await depositContractJettonWallet.getJettonBalance();
  expect(depositContractJettonBalanceBefore).toBe(toNano(0));

  // let contractJettonWalletAddress = await testDeposit.getDepositJettonWallet();
  // log(`contract Jetton wallet address :${contractJettonWalletAddress} `);


  const depositJettonsToCf = await adminJettonWallet.sendTransfer(admin.getSender(),toNano(0.1),tokens_for_presale,testDeposit.address,admin.address,null,toNano(0.05),null);


  printTransactionFees(depositJettonsToCf.transactions);

  const depositContractJettonBalanceAfter = await depositContractJettonWallet.getJettonBalance();

  expect(depositContractJettonBalanceAfter).toBe(tokens_for_presale)

  blockchain.now = end_time + 20;

  // admin intitializes sof halt
  const initiateSoftHalt = await testDeposit.sendActivateCfSoftHalt(admin.getSender(),{
    value:toNano('0.05')
  })

  const cfHaltStatus = await testDeposit.getFundRaisingContractStatus();
  expect(cfHaltStatus.toString()).toBe("-1");


  const targetWallet = await blockchain.treasury('targetWallet',{balance:toNano(10)});

  const targetJettonWallet = await jettonWalletForTxn(targetWallet.address);

  const withdrawJettons = await testDeposit.sendJettonWithdrawalAdmin(admin.getSender(),{
    value:toNano('0.05'),to_address:targetWallet.address,amount:toNano('20')
  })

  const targetJettonWalletBalance = await targetJettonWallet.getJettonBalance();

  log(`targetJettonWallet Balance: ${targetJettonWalletBalance}`);

  const withdrawTons = await testDeposit.sendTonWithdrawalAdmin(admin.getSender(),{
    value:toNano('0.05'),to_address:targetWallet.address,amount:toNano(2)
  })

  printTransactionFees(withdrawTons.transactions);

  const tartgetWalletBalanceAfterTonWithdrawal = await targetWallet.getBalance();
  log(`target wallet balance after withdrawal: ${tartgetWalletBalanceAfterTonWithdrawal}`);

  // expect(tartgetWalletBalanceAfterTonWithdrawal).toBe(toNano(12));



})  

});