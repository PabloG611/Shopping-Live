import { useContext } from 'react'

import { TransferenciasContext, type TransferenciasContextValue } from './transferenciasContext'

export function useTransferencias(): TransferenciasContextValue {
  const ctx = useContext(TransferenciasContext)
  if (!ctx) {
    throw new Error('useTransferencias debe usarse dentro de TransferenciasProvider')
  }
  return ctx
}
