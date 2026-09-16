import { GraduationCap, ShoppingBag, Building2, Cross, Plane, Trophy, Home, MapPin } from "lucide-react"

// Presentation for the VenueType enum (backend/prisma/schema.prisma). Nothing
// branches on the type — it only picks the icon and the word a customer sees.

export const VENUE_TYPE_LABEL = {
  UNIVERSITY: "Campus",
  MALL: "Mall",
  TECH_PARK: "Tech Park",
  OFFICE_PARK: "Office Park",
  HOSPITAL: "Hospital",
  AIRPORT: "Airport",
  STADIUM: "Stadium",
  RESIDENTIAL: "Residential",
  OTHER: "Place",
}

const ICONS = {
  UNIVERSITY: GraduationCap,
  MALL: ShoppingBag,
  TECH_PARK: Building2,
  OFFICE_PARK: Building2,
  HOSPITAL: Cross,
  AIRPORT: Plane,
  STADIUM: Trophy,
  RESIDENTIAL: Home,
  OTHER: MapPin,
}

export function VenueIcon({ type, size = 14, ...props }) {
  const Icon = ICONS[type] || MapPin
  return <Icon size={size} {...props} />
}
