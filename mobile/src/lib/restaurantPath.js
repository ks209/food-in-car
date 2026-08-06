import { useLocation, useParams } from "react-router-dom"

// A restaurant is reachable at two URLs: the original /restaurant/<id> and the
// vanity /<slug> that QR codes and shared links point at. Both render the same
// pages, so every in-app link is built from whichever form the customer
// actually arrived on — hard-coding one shape would flip their address bar
// mid-session and lose the nice URL the moment they tapped anything.
//
// The route param is named `restaurantId` in both shapes and holds an id or a
// slug; the API resolves either (see backend/utils/slug.js).
export function useRestaurantBase() {
  const { restaurantId } = useParams()
  const { pathname } = useLocation()
  return pathname.startsWith("/restaurant/") ? `/restaurant/${restaurantId}` : `/${restaurantId}`
}
