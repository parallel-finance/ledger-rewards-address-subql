import { SubstrateExtrinsic } from "@subql/types";
import { Extrinsic } from "@polkadot/types/interfaces";
import { AnyTuple } from "@polkadot/types/types";
import { RemarkEntity } from "../types";
import { Option, Some, None, isNone } from "../lib";

const SECTION_SYSTEM = "system";
const METHOD_REMARK = "remark";

interface RemarkData {
    action: string,
    timestamp: string,
    msg: string
}

function isRemark(ext: Extrinsic): Boolean {
    const { method: { method, section } } = ext
    return section === SECTION_SYSTEM && method === METHOD_REMARK
}


/**
 * 
 * @param args 
 * @returns 
 * {
 *  "action":"Replace address",
 *  "timestamp":"2021-01-14",
 *  "msg":"I confirm I want to receive project rewards 
 *  to: ADDRESS. I agree and acknowledge that Parallel Finance shall not be liable for any direct/ indirect losses of any kind."}
 */
function parseRemarkBody(args: AnyTuple): Option<string> {
    const data = Buffer.from(args.toString().slice(2), 'hex').toString('utf8')
    logger.info("get remark extrinsic origin data: %o", data)
    if (data.startsWith("{")) {
        // NOTE: if remark policy change, need to modify this
        try {
            const jDat = JSON.parse(data) as RemarkData
            const { action, timestamp, msg } = jDat
            if (!action || !timestamp || !msg) return None
            logger.info("parsed remark json data: %o", jDat)
            return Some(msg.split("to:")[1].split(".")[0])
        } catch (e) {
            logger.error("parse remark data error: %o", e)
            return None
        }
    }
    return None
}

export async function handleRemarkExtrinsic(ext: SubstrateExtrinsic): Promise<void> {
    const { isSigned, method: { args } } = ext.extrinsic
    if (!isRemark(ext.extrinsic) || !isSigned || args.length < 1) {
        return
    }
    const re = parseRemarkBody(args)
    if (isNone(re)) {
        return
    }
    const dstAddress = re.value
    const ex = ext.extrinsic
    const remarkEntity = RemarkEntity.create({
        id: ex.hash.toString(),
        oriAddress: ex.signer.toString(),
        dstAddress,
        blockHeight: ext.block.block.header.number.toNumber(),
        createAt: ext.block.timestamp
    })
    await remarkEntity.save()
}
