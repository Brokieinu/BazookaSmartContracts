import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';
import { Opcodes } from '../helpers/Opcodes';

export type CrowdFundingConfig = {
    admin_address: Address | undefined,
    jetton_address: Address | undefined,
    start_time:number,
    end_time:number,
    individual_limit:bigint,
    soft_cap:bigint,
    total_cap_raised:bigint,
    tokens_for_presale:bigint,
    liquidity_percent:number,
    is_liquidy_withdrawn:number,
    is_commission_withdrawn:number,
    soft_halt:number,
    jetton_wallet_code:Cell,
    billCode:Cell
};

export const errorCodes={
    deposit_time_ended : 80,
    withdrawal_not_allowd:88,
    invalid_admin_withdrawal_request:99,


}

export function mainConfigToCell(config: CrowdFundingConfig): Cell {
    return beginCell()
          .storeAddress(config.admin_address)
          .storeAddress(config.jetton_address)
          .storeUint(config.start_time,64)
          .storeUint(config.end_time,64)
          .storeCoins(config.individual_limit)
          .storeCoins(config.soft_cap)
          .storeCoins(config.total_cap_raised)
          .storeCoins(config.tokens_for_presale)
          .storeUint(config.liquidity_percent,16)
          .storeUint(config.is_liquidy_withdrawn,8)
          .storeUint(config.is_commission_withdrawn,8)
          .storeUint(config.soft_halt,8)
          .storeRef(config.jetton_wallet_code)
          .storeRef(config.billCode)
          .endCell();
}

export class CrowdFunding implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new CrowdFunding(address);
    }

    static createFromConfig(config: CrowdFundingConfig, code: Cell, workchain = 0) {
        const data = mainConfigToCell(config);
        const init = { code, data };
        return new CrowdFunding(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint,jetton_wallet_cell:Cell) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async getAdmin(provider:ContractProvider):Promise<Address>{
      const result = await provider.get('getAdmin',[]);
      return result.stack.readAddress();
    }

    async sendChangeAdmin(provider:ContractProvider,via:Sender,opts:{
        value:bigint, address:Address
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body:beginCell()
                .storeUint(Opcodes.change_admin,32)
                .storeAddress(opts.address)
                .endCell()
        })
    }

    async sendDeposit(provider:ContractProvider,via:Sender,opts:{
        value:bigint
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body:beginCell()
                . storeUint(Opcodes.deposit,32)
                . endCell()
        });
    }
    
    async sendWithdrawCommision(provider:ContractProvider,via:Sender,opts:{
        value:bigint,
        platform_address:Address | undefined
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                . storeUint(Opcodes.withdraw_commission,32)
                . storeAddress(opts.platform_address)
                . endCell()
        })
    }

    async sendWithdrawLiquidity(provider:ContractProvider,via:Sender,opts:{
        value:bigint,
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                . storeUint(Opcodes.withdraw_liquidty_allocation,32)
                . endCell()
        })
    }

    async sendCreatorFunds(provider:ContractProvider,via:Sender,opts:{
        value:bigint,
        creator_address:Address | undefined
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.tx_to_project_owner,32)
                .storeAddress(opts.creator_address)
                .endCell()
        })
    }

    async sendInvestorWithdrawalReq(provider:ContractProvider,via:Sender,opts:{
        value:bigint
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.investor_withdrawal_req,32)
                .endCell()
        })
    }

    async sendInvestorJettonClaimReq(provider:ContractProvider,via:Sender,opts:{
        value:bigint
    }){
        await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.jetton_claim_req,32)
                .endCell()
        })
    }


    async sendActivateCfSoftHalt(provider:ContractProvider,via:Sender,opts:{
        value:bigint
    }){
        try{
            const res = await provider.internal(via,{
                value:opts.value,
                sendMode:SendMode.PAY_GAS_SEPARATELY,
                body:beginCell()
                .storeUint(Opcodes.activate_soft_halt,32)
                .endCell()
            })
        }
        catch(error){
            throw(error)
        }
    }

    async sendDeactivateCfSoftHalt(provider:ContractProvider,via:Sender,opts:{
        value:bigint
    }){
        try{
            const res = await provider.internal(via,{
                value:opts.value,
                sendMode:SendMode.PAY_GAS_SEPARATELY,
                body:beginCell()
                    .storeUint(Opcodes.deactivate_soft_halt,32)
                    .endCell()
            })
        }
        catch(error){
            throw(error);
        }
    }

    async sendJettonWithdrawalAdmin(provider:ContractProvider,via:Sender,opts:{
        value:bigint,to_address:Address,amount:bigint
    })
    {
        try{
            const res = await provider.internal(via,{
                value:opts.value,
                sendMode:SendMode.PAY_GAS_SEPARATELY,
                body:beginCell()
                .storeUint(Opcodes.admin_jetton_withdrawal,32)
                .storeAddress(opts.to_address)
                .storeCoins(opts.amount)
                .endCell()

            })
        }
        catch(error){
            throw(error);
        }
    }

    async sendTonWithdrawalAdmin(provider:ContractProvider,via:Sender,opts:{
        value:bigint,to_address:Address|undefined,amount:bigint
    })
    {
        try{
            const res = await provider.internal(via,{
                value:opts.value,
                sendMode:SendMode.PAY_GAS_SEPARATELY,
                body:beginCell()
                .storeUint(Opcodes.admin_ton_withdrawal,32)
                .storeAddress(opts.to_address)
                .storeCoins(opts.amount)
                .endCell()

            })
        }
        catch(error){
            throw(error);
        }
    }

    async sendUpdateTime(provider:ContractProvider,via:Sender,opts:{
        value:bigint,new_time:bigint
    }){
        let res = await provider.internal(via,{
            value:opts.value,
            sendMode:SendMode.PAY_GAS_SEPARATELY,
            body:beginCell()
            .storeUint(Opcodes.extend_time,32)
            .storeUint(opts.new_time,64)
            .endCell()
        })
    }


    async getDepositPublicData(provider:ContractProvider){
        let res = await provider.get('get_public_data',[]);
        let jetton_address = res.stack.readAddress();
        let start_time = res.stack.readBigNumber();
        let  end_time = res.stack.readBigNumber();
        let individual_limit = res.stack.readBigNumber();
        let soft_cap = res.stack.readBigNumber();
        let total_cap_raised = res.stack.readBigNumber();
        let tokens_for_presale = res.stack.readNumber();
        let liquidity_percent = res.stack.readNumber();
        return{
            jetton_address,
            start_time,
            end_time,
            individual_limit,
            soft_cap,
            total_cap_raised,
            tokens_for_presale,
            liquidity_percent
        }
    }

    async getContractBalance(provider:ContractProvider):Promise<bigint>{
     try{
        const result = await provider.get('get_contract_balance',[]);
        return result.stack.readBigNumber();
    }
    catch(error){
        console.log(error)
        throw(error)
    }
    }






    async getTotalCapRaised(provider:ContractProvider):Promise<bigint>{
        const result = await provider.get('get_total_cap_raised',[]);
        return result.stack.readBigNumber();
    }


    async getDepositJettonWallet(provider:ContractProvider){
        try{
            const res = await provider.get('get_jetton_wallet_address',[]);
            return res
            // return res.stack.readAddress();
        }
        catch(error){
            throw error
        }
    }

    async getStartTime(provider:ContractProvider):Promise<bigint>{
        try{
            const result = await provider.get('get_start_time',[]);
            return result.stack.readBigNumber();
        }
        catch(error){
            
            console.log(`Error:${error}`)
            throw(error)
        }
       
    }

    async getFundRaisingContractStatus(provider:ContractProvider){
        const result = await provider.get('get_fundraising_status',[]);
        return result.stack.readBigNumber();
    }

    async getEndTime(provider:ContractProvider):Promise<bigint>{
        const result = await provider.get('get_end_time',[]);
        return result.stack.readBigNumber();
    }

    async getSoftCap(provider:ContractProvider):Promise<bigint>{
        const result = await provider.get('get_soft_cap',[]);
        return result.stack.readBigNumber();
    }

    async getIndividualLimit(provider:ContractProvider):Promise<bigint>{
        const result = await provider.get('get_individual_limit',[]);
        return result.stack.readBigNumber();
    }

    async getValidFundingRound(provider:ContractProvider):Promise<bigint>{
        const result = await provider.get('check_valid_funding_round',[]);
        return result.stack.readBigNumber();
    }

    async getBillAddress(provider:ContractProvider,userAddress:Address){
        const result = await provider.get('get_bill_address',[{type: 'slice', cell: beginCell().storeAddress(userAddress).endCell()}]);
        return result.stack.readAddress();
    }
}