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
}
