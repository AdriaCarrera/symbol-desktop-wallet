import {AppState, NetworkCurrency} from '@/core/model'
import {localSave, localRead} from '@/core/utils'
import {Store} from 'vuex'
import {Address, AccountHttp, AccountInfo} from 'nem2-sdk'

const getBalanceFromAccountInfo = ( accountInfo: AccountInfo,
                                    networkCurrency: NetworkCurrency): {balance: number, address: string} => {
    const address = accountInfo.address.plain()
    
    try {
        if (!accountInfo.mosaics.length) return { balance: 0, address }
        const xemIndex = accountInfo.mosaics
            .findIndex(mosaic => mosaic.id.toHex() === networkCurrency.hex)

        if (xemIndex === -1) return { balance: 0, address }

        const balance = accountInfo.mosaics[xemIndex].amount.compact() / Math.pow(10, networkCurrency.divisibility)
        return { balance, address }
    } catch (error) {
        console.error("getBalanceFromAccountInfo: error", error)
        return { balance: 0, address }
    }
}

// @TODO: Could set more things such as multisig status
export const setWalletsBalances = async (store: Store<AppState>): Promise<void> => {
    try {
        const {wallet, accountName, node, networkCurrency} = store.state.account
        const {walletList} = store.state.app
        if (!walletList.length) return
        const addresses = walletList.map(({address}) => Address.createFromRawAddress(address))
        const accountsInfo = await new AccountHttp(node).getAccountsInfo(addresses).toPromise()
        const balances = accountsInfo.map(ai => getBalanceFromAccountInfo(ai, networkCurrency)) 
    
        const appWalletsWithBalance = walletList
            .map(wallet => {
                const balanceFromAccountInfo = balances.find(({address}) => wallet.address === address)
                if (balanceFromAccountInfo === undefined) return {...wallet, balance: 0}
                return {...wallet, balance: balanceFromAccountInfo.balance}
            })

        const activeWalletWithBalance = appWalletsWithBalance.find(w => w.address === wallet.address)

        if (activeWalletWithBalance === undefined) {
            throw new Error('an active wallet was not found in the wallet list')
        }

        store.commit('SET_WALLET_LIST', appWalletsWithBalance)
        store.commit('SET_WALLET', activeWalletWithBalance)

        // @WALLETS: make a standard method
        const localList = localRead('accountMap')
        const listToUpdate = localList === '' ? {} : JSON.parse(localList)
        if (!listToUpdate[accountName]) throw new Error
        listToUpdate[accountName].wallets = appWalletsWithBalance
        localSave('accountMap', JSON.stringify(listToUpdate))
    } catch (error) {
        console.error('setWalletsBalances: error', error)
    }
}