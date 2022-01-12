import { SubstrateExtrinsic } from "@subql/types";
import { Extrinsic } from "@polkadot/types/interfaces";
import { AnyTuple } from "@polkadot/types/types";
import { RemarkEntity } from "../types";
import { Option, Some, None, isNone } from "../lib";

const SECTION_SYSTEM = "system";
const METHOD_REMARK = "remark";

interface RemarkData {
    target: string,
    address: string,
    terms: string
}

function isRemark(ext: Extrinsic): Boolean {
    const { method: { method, section } } = ext
    return section === SECTION_SYSTEM && method === METHOD_REMARK
}

function parseRemarkBody(args: AnyTuple): Option<RemarkData> {
    const data = Buffer.from(args.toString().slice(2), 'hex').toString('utf8')
    logger.debug("parse remark extrinsic data: %o", data)
    if (data.startsWith("{")) {
        // NOTE: if remark policy change, need to modify this
        try {
            return Some(JSON.parse(data) as RemarkData)
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
    const data = re.value
    const ex = ext.extrinsic
    const remarkEntity = RemarkEntity.create({
        id: ex.hash.toString(),
        oriAddress: ex.signer.toString(),
        disAddress: data.address,
        createAt: ext.block.timestamp
    })
    await remarkEntity.save()
}
