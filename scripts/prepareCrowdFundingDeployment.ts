import { toNano,Cell, Address,Account } from '@ton/core';
import { CrowdFunding } from '../wrappers/CrowdFundingWrapper';
import { compile, NetworkProvider, UIProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '../wrappers/JettonMaster';


export async function run(provider:NetworkProvider){
  const ui = provider.ui();
  const admin = provider.sender();
  
  const billCode:Cell = await compile("DepositBill");
  const jetton_wallet_code:Cell = await compile("JettonWallet");


  const days = await ui.input("Enter duration of days the crowdfunding will be valid for: ");



  const start_time = 1723472280;
  // const duration = parseInt(days) * 24 * 60 * 60 * 1000;
  // const duration = 24 * 60 * 60;
  const end_time = 1723731480;

  console.log(`Start time: ${start_time} `);
  console.log(`End time: ${end_time}`);
  // console.log(new Date(start_time).toISOString());
  // console.log(new Date(end_time).toISOString());


  const individual_limit = toNano(await ui.input("individual limit: "))
  const soft_cap = toNano(await ui.input('soft cap: '));
  const tokens_for_presale = toNano(await ui.input('tokens for presale: '));
  const liquidity_percent = parseInt(await ui.input('liquidity percent: '));
  const jetton_address = Address.parse(await ui.input("enter you token address: "))

  const testDeposit = provider.open(CrowdFunding.createFromConfig({
      admin_address:provider.sender().address,
      jetton_address,
      start_time,
      end_time,
      individual_limit,
      soft_cap:soft_cap,
      total_cap_raised:toNano(0),
      tokens_for_presale,
      liquidity_percent,
      is_liquidy_withdrawn:0,
      is_commission_withdrawn:0,
      soft_halt:0,
      jetton_wallet_code,
      billCode
  },await compile('CrowdFunding')));

  await testDeposit.sendDeploy(provider.sender(),toNano('0.05'),jetton_wallet_code);

  await provider.waitForDeploy(testDeposit.address);

  const res = await testDeposit.getDepositPublicData();

  console.log('deploy result: ',res);
}