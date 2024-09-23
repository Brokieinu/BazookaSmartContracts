import { Address, beginCell, toNano } from '@ton/core';
import { JettonMaster, jettonContentToCell } from '../wrappers/JettonMaster';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const admin = provider.sender();

    const wallet_code = await compile('JettonWallet');

    const jettonMetadataUrl = await ui.input("Enter the metadata url: ");
    let totalSupply = await ui.input("Enter total supply for your jetton");


    const content = jettonContentToCell({type:1,uri:jettonMetadataUrl});

    const jettonMaster = provider.open(JettonMaster.createFromConfig({
      totalSupply:toNano(0),
      admin:provider.sender().address,
      content,
      wallet_code
    }, await compile('JettonMaster')));

    await jettonMaster.sendDeploy(provider.sender(), toNano('0.05'));

    await jettonMaster.sendMint(provider.sender(),provider.sender().address as Address,toNano(totalSupply),toNano(0.05),toNano(1));

    await provider.waitForDeploy(jettonMaster.address);

    const data = await jettonMaster.getTotalSupply();

    console.log(`Data: ${data}`)

}
 