export interface Well {
  id: string
  basin: string
  basinName: string
  lat: number | null
  lng: number | null
  township: string
  range: string
  section: string
  quarterQuarter: string
  owner: string
  completionDate: string
  drillerLicense: string
  drillerName: string
  drillDepth: number | null
  staticWaterLevel: number | null
  casingDiameter: number | null
  apn: string
  workType: string
  proposedUse: string
  pdfUrl?: string
  parcelApn?: string | null
  parcelLat?: number | null
  parcelLng?: number | null
  parcelAcres?: number | null
  originalLat?: number | null
  originalLng?: number | null
  gpsSource?: string
  dataQuality?: string
  scanAddress?: string | null
  scanOwner?: string | null
  scanConfidence?: string | null
  scanLat?: number | null
  scanLng?: number | null
  scanApn?: string | null
  verifiedLat?: number | null
  verifiedLng?: number | null
}
