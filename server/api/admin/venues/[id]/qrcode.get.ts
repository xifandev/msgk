import { requirePermission } from '../../../../utils/auth'
import { positiveId } from '../../../../utils/http'
import { createVenueQrCode } from '../../../../utils/wechat'
import { requireScopedVenue } from '../-helpers'

export default defineEventHandler(async (event) => {
  const admin = await requirePermission(event, 'venues:view')
  const id = positiveId(getRouterParam(event, 'id'), '场所ID')
  const venue = await requireScopedVenue(admin, id)
  const qrCode = await createVenueQrCode(venue.id)

  setResponseHeaders(event, {
    'Content-Type': qrCode.contentType,
    'Content-Length': String(qrCode.data.byteLength),
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `inline; filename="venue-${venue.id}-qrcode"`
  })
  return qrCode.data
})
