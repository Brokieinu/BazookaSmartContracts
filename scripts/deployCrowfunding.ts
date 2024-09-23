// import { toNano,Cell, Address,Account } from '@ton/core';
// import { CrowdFunding } from '../wrappers/CrowdFundingWrapper';
// import { compile, NetworkProvider } from '@ton/blueprint';

// export async function run(provider: NetworkProvider) {
//     const depositBillCode:Cell = await compile("DepositBill")
//     const start_time = Date.now().valueOf()
//     const duration = 10 * 60 * 1000; //10 minutes 
//     const end_time = start_time + duration 
//     const wallet_code = await compile("JettonWallet");

//     const crowdfunding = provider.open(CrowdFunding.createFromConfig({
//         admin_address:provider.sender().address,
//         jetton_address:jetton_address,
//         start_time:Date.now().valueOf(),
//         end_time:end_time,
//         individual_limit:BigInt(toNano(1000)),
//         soft_cap:BigInt(toNano(10000)),
//         total_cap_raised:BigInt(toNano(0)),
//         tokens_for_presale:BigInt(toNano(7000000)),
//         liquidity_percent:50,
//         is_liquidy_withdrawn:0,
//         is_commission_withdrawn:0,
//         jetton_wallet_code:wallet_code,
//         billCode:depositBillCode
//     }, await compile('CrowdFunding')));

//     await crowdfunding.sendDeploy(provider.sender(), toNano('0.05'));

//     await provider.waitForDeploy(crowdfunding.address);

//     const res = await crowdfunding.getDepositPublicData();

//     console.log("Res: ",res);



//     // console.log(`Start time is : ${await testDeposit.getStartTime()}`);

//     // console.log(`End time is: ${await testDeposit.getEndTime()}`);

//     // console.log(`Individual limit is: ${await testDeposit.getIndividualLimit()}`);

//     // console.log(`Total cap raised is: ${await testDeposit.getTotalCapRaised()}`);
// }
