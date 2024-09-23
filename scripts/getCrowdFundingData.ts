import { toNano,Cell, Address,Account } from '@ton/core';
import { CrowdFunding } from '../wrappers/CrowdFundingWrapper';
import { compile, NetworkProvider, UIProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '../wrappers/JettonMaster';


export async function run(provider:NetworkProvider){
  const ui = provider.ui();


  const presale_address = Address.parse(await ui.input("enter you presale address: "))

  const testDeposit = provider.open(CrowdFunding.createFromAddress(presale_address));

  const res = await testDeposit.getDepositPublicData();
  const admin = await testDeposit.getAdmin();

  console.log('contract result: ',res);
  console.log('Admin Address :',admin);
}