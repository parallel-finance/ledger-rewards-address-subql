import { Result } from '.'
export type ResultT<T> = Result<T, string>
export type PVoidT = Promise<void>
export type PBoolT = Promise<boolean>
export type PResultT<T> = Promise<Result<T, string>>

export * from './option'
export * from './result'