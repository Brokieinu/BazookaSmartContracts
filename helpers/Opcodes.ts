import { crc32 } from './crc32';

export const Opcodes ={
  deposit : crc32("deposit"),
  withdraw_funds:crc32("withdraw_funds"),
  update_investment_to_bill:crc32('op::update_investment_to_bill'),
  investor_withdrawal_req:crc32('investor_withdrawal_req'),
  opinitiate_withdrawal:crc32('op::initiate_withdrawal'),
  process_investor_withdrawal:crc32('process_investor_withdrawal'),
  withdraw_from_bill : crc32('op::withdraw_from_bill'),
  withdraw_commission: crc32('withdraw_commission'),
  tx_to_project_owner: crc32('tx_to_project_owner'),
  withdraw_liquidty_allocation:crc32('withdraw_liquidty_allocation'),
  setup_jetton_wallet:crc32('setup_jetton_wallet'),
  initiate_jetton_claim:crc32('initiate_jetton_claim'),
  jetton_claim_req:crc32("jetton_claim_req"),
  process_jetton_claim:crc32('process_jetton_claim'),
  change_admin:crc32('change_admin'),
  activate_soft_halt:crc32("activate_soft_halt"),
  deactivate_soft_halt:crc32("deactivate_soft_halt"),
  admin_jetton_withdrawal:crc32('admin_jetton_withdrawal'),
  admin_ton_withdrawal:crc32('admin_ton_withdrawal'),
  extend_time:crc32('extend_time')
}


// console.log(`Opcodes:${JSON.stringify(Opcodes)}`);
