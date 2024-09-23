import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import {Opcodes} from "../helpers/Opcodes";

export type depositBillConfig = {
    funding_contract_address: Address,
    userAddress: Address | undefined,
    individual_limit:bigint
};

export function DepositBillConfigToCell(config:depositBillConfig){
    return beginCell()
           .storeAddress(config.funding_contract_address)
           .storeCoins(0)
           .storeCoins(config.individual_limit)
           .storeAddress(config.userAddress)
           .endCell()
}

export class DepositBill implements Contract{
    constructor(readonly address:Address,readonly init?:{code:Cell,data:Cell}){}

    static creatFromAddress(address:Address){
        return new DepositBill(address);
    }

    static createFromConfig(config:depositBillConfig,code:Cell,workchain = 0){
        const data = DepositBillConfigToCell(config)
        const init = {code,data};
        return new DepositBill(contractAddress(workchain,init),init);
    }

    static createFromConfigForTest(config:depositBillConfig,code:Cell,workchain = 0){
        const data = DepositBillConfigToCell(config)
        const init = {code,data};
        return new DepositBill(contractAddress(workchain,init),init);
    }


    async sendDeploy(provider:ContractProvider,via:Sender,value:bigint){
        await provider.internal(via,{
            value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body:beginCell().endCell()
        })
    }

    async getIsDepositWithdrawn(provider:ContractProvider){
        if ((await provider.getState()).state.type == 'uninit') {
            return false;
        }
        const stack = (await provider.get('get_is_deposit_withdrawn', [])).stack;
        return stack.readBoolean();
    }

    async getDepositBillData(provider:ContractProvider){
        const result = await provider.get('get_deposit_bill_data',[]);

        return{
            fundraising_contract_address:result.stack.readAddress(),
            total_coins_deposited:result.stack.readBigNumber(),
            individual_limit:result.stack.readBigNumber(),
            user_addres:result.stack.readAddress()
        }
    }

    async getDepositBillBalance(provider:ContractProvider){
        const result= await provider.get('get_deposit_bill_balance',[]);
        return result.stack.readNumber();
    }


}