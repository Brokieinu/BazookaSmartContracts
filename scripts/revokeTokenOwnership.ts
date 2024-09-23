import { Address, beginCell, toNano } from '@ton/core';
import { JettonMaster, jettonContentToCell } from '../wrappers/JettonMaster';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const admin = provider.sender();

    const wallet_code = await compile('JettonWallet');

    const jettonMinter = Address.parse(await ui.input("jetton minter address: "));
    const to_address = Address.parse(await ui.input("set ownership to: "));



    const jettonMaster = provider.open(JettonMaster.createFromAddress(
        jettonMinter
    ));

    await jettonMaster.sendChangeAdmin(provider.sender(),to_address);
    // await jettonMaster.sendMint(provider.sender(),provider.sender().address as Address,toNano(totalSupply),toNano(0.05),toNano(1));

    await sleep(10000);

    const data = await jettonMaster.getAdminAddress();

    console.log(`Data: ${data}`)

}
 