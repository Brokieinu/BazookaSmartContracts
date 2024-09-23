import {Cell,Address,toNano} from '@ton/core';
import { DepositBill } from '../wrappers/DepositBill';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {

  const depositBill = provider.open(DepositBill.createFromConfig({
    funding_contract_address:Address.parse("EQCs_uT4hxnOWUbwGYJZsG74pr_wjMeZDtlCxlcdZFPFS4iq"),
    userAddress:Address.parse("EQABEq658dLg1KxPhXZxj0vapZMNYevotqeINH786lpwwSnT"),
    individual_limit:toNano(1000),
  }, await compile('DepositBill')));

  await depositBill.sendDeploy(provider.sender(), toNano('0.05'));

  await provider.waitForDeploy(depositBill.address);

  const data = await depositBill.getDepositBillData();

  console.log(`Data: ${JSON.stringify(data)}`);
  
}
