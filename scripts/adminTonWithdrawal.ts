import { toNano,Cell, Address,Account } from '@ton/core';
import { CrowdFunding } from '../wrappers/CrowdFundingWrapper';
import { compile, NetworkProvider, sleep, UIProvider } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { JettonMaster } from '../wrappers/JettonMaster';
import { send } from 'process';


export async function run(provider:NetworkProvider){
  const ui = provider.ui();
  const admin = provider.sender();
  
  const presale_contract_address = Address.parse(await ui.input("enter you presale contract address: "))

  const testDeposit = provider.open(CrowdFunding.createFromAddress(presale_contract_address));

  await testDeposit.sendTonWithdrawalAdmin(provider.sender(),{
    value:toNano('0.05'),
    to_address:Address.parse("0QAkQn2q_6DSEbJktjmNK-o-fBfT_SJS-mG2jo5CklD9txmS"),
    amount:toNano(5)
  })

  await sleep(5000)

  const res = await testDeposit.getDepositPublicData();

  console.log('update result: ',res);
}