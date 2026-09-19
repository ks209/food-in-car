import { useEffect, useState } from "react"
import { Link, Navigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { BUSINESS as B, sellerFrom } from "../lib/legal"
import { restaurantApi } from "../api"
import { applyTheme, DEFAULT_HEX } from "../lib/theme"
import { useRestaurantBase } from "../lib/restaurantPath"

// Policy pages, in two flavours from one template:
//   /legal/:doc                     — the platform (Carkhanaa) itself
//   /<restaurant>/legal/:doc        — that restaurant as the seller
//
// Each restaurant takes payment into its OWN PhonePe merchant account, so on
// its pages the restaurant is named as the seller and its support contact is
// used, while the grievance officer stays the platform's (see lib/legal.js).
// Payment gateways review the restaurant's ordering URL, so these must be
// publicly reachable without logging in.

const H = ({ children }) => <h2 style={{ fontSize: "1rem", fontWeight: 800, margin: "1.4rem 0 0.4rem" }}>{children}</h2>
const P = ({ children }) => <p style={{ fontSize: "0.88rem", lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: "0.6rem" }}>{children}</p>
const UL = ({ items }) => (
  <ul style={{ paddingLeft: "1.2rem", marginBottom: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
    {items.map((t, i) => <li key={i} style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "var(--text-secondary)" }}>{t}</li>)}
  </ul>
)

function Seller({ seller }) {
  return (
    <>
      <H>{seller.isRestaurant ? "Seller" : "Operator"}</H>
      <P>
        {seller.name}{seller.isRestaurant && seller.tradeName !== seller.name ? ` (trading as ${seller.tradeName})` : ""}, {seller.address}.
        {" "}Email {seller.email} · Phone {seller.phone}.
        {seller.gstin ? ` GSTIN ${seller.gstin}.` : ""}
        {seller.fssai ? ` FSSAI Lic. No. ${seller.fssai}.` : ""}
      </P>
      {seller.isRestaurant && (
        <P>
          Orders placed here are sold by {seller.name} and paid directly into its payment account.
          {" "}{B.brand} provides the ordering platform.
        </P>
      )}
    </>
  )
}

function Grievance() {
  return (
    <>
      <H>Grievances</H>
      <P>
        For complaints about the platform or your personal data, contact {B.brand}&apos;s Grievance Officer:
        {" "}{B.grievanceOfficer} ({B.grievanceEmail}). We acknowledge complaints within 48 hours and aim to
        resolve them within 30 days. For an order, the restaurant&apos;s contact above is fastest.
      </P>
    </>
  )
}

function Privacy({ seller }) {
  return (
    <>
      <P>
        This policy explains what information {B.brand} (operated by {B.legalName}) collects when you order food
        through this website, how it is used and your choices. It is published in line with the Information
        Technology Act, 2000 and the Digital Personal Data Protection Act, 2023.
      </P>
      <H>What we collect</H>
      <UL items={[
        "Name and 10-digit mobile number you enter at checkout, and a password if you create an account.",
        "Vehicle number and, if the restaurant offers it, the parking spot you choose — so your order can be brought to your car.",
        "Your order: items, customisations, instructions, amounts, taxes and order status history.",
        "Your location, only if you allow it, to show restaurants near you. It is used in your browser to sort results and is not stored on our servers.",
        "A random device identifier and login cookies, to keep your cart, active order and session working.",
      ]} />
      <P>
        Payments are processed by PhonePe. We do not see or store your card, UPI or bank details; we only receive
        the payment status and transaction reference.
      </P>
      <H>How we use it</H>
      <UL items={[
        "To place your order with the restaurant and get it served to your car or ready for pickup.",
        "To show your order status and past orders, and to contact you about an order.",
        "To handle payments, refunds, invoices and tax records required by law.",
        "To keep the service secure and fix problems.",
      ]} />
      <P>We do not sell your personal data or use it for third-party advertising.</P>
      <H>Who we share it with</H>
      <UL items={[
        `${seller.isRestaurant ? seller.name : "The restaurant you order from"}, and its staff delivering your order (name, mobile number, vehicle, parking spot and order details).`,
        "PhonePe, to process your payment and any refund.",
        "Hosting and infrastructure providers that run the service for us, under confidentiality obligations.",
        "Authorities, when required by law.",
      ]} />
      <H>How long we keep it</H>
      <P>
        Order and invoice records are kept for as long as tax and accounting laws require. Account details are kept
        while your account is active. You can ask us to delete data we are not required to keep.
      </P>
      <H>Your rights</H>
      <P>
        You can ask to access, correct or delete your personal data, withdraw consent, or nominate someone to act for
        you, by writing to {B.grievanceEmail}. Withdrawing consent may mean we cannot take further orders from you.
      </P>
      <H>Security</H>
      <P>Data is sent over HTTPS and access is limited to people who need it to run the service.</P>
      <Seller seller={seller} />
      <Grievance />
    </>
  )
}

function Terms({ seller }) {
  return (
    <>
      <P>
        These terms apply when you order through {B.brand}
        {seller.isRestaurant ? ` from ${seller.tradeName}` : ""}. By placing an order you agree to them.
      </P>
      <H>Who you are buying from</H>
      <P>
        {B.brand} is a platform that lets you order from independent restaurants.
        {seller.isRestaurant
          ? ` Your order is sold and prepared by ${seller.name}, which is responsible for the food, its quality, hygiene, ingredients, allergen information, menu prices and taxes, and its FSSAI licence.`
          : " Each restaurant prepares your food and is responsible for its quality, hygiene, ingredients, allergen information, menu prices and taxes, and its FSSAI licence."}
      </P>
      <H>Orders</H>
      <UL items={[
        "An order is confirmed only after payment succeeds. Prices, taxes and the total are shown before you pay.",
        "Provide a correct name, mobile number, vehicle number and parking spot. Be at your vehicle (or the pickup counter) and show your order QR code or code to collect the order.",
        "Orders can only be placed while the restaurant is open. Waiting times shown are estimates, not guarantees.",
        "The restaurant may cancel an order it cannot fulfil (for example an item runs out); you will be refunded as per the Refund Policy.",
      ]} />
      <H>Payments</H>
      <P>
        Payments are made through PhonePe{seller.isRestaurant ? ` into ${seller.name}'s merchant account` : ""} and are
        subject to PhonePe&apos;s terms. If money is debited but the order is not confirmed, it is reversed as described
        in the Refund Policy.
      </P>
      <H>Acceptable use</H>
      <P>
        Do not place fake orders, misuse offers, interfere with the service or use it unlawfully. We may block access
        for misuse.
      </P>
      <H>Liability</H>
      <P>
        To the extent permitted by law, liability for any order is limited to the amount paid for that order. Nothing
        here limits your rights under the Consumer Protection Act, 2019.
      </P>
      <H>Changes and governing law</H>
      <P>
        These terms may be updated; the version on this page applies to new orders. They are governed by the laws of
        India, with courts at {B.jurisdiction} having jurisdiction.
      </P>
      <Seller seller={seller} />
      <Grievance />
    </>
  )
}

function Refunds({ seller }) {
  const who = seller.isRestaurant ? seller.name : "the restaurant"
  return (
    <>
      <P>
        This policy explains when you get your money back for orders placed
        {seller.isRestaurant ? ` with ${seller.tradeName}` : ` through ${B.brand}`}. Payments are collected by {who},
        so refunds are issued by {who} through PhonePe.
      </P>
      <H>Cancelling an order</H>
      <P>
        Food is prepared fresh as soon as an order is paid, so orders cannot be cancelled from the app once payment is
        confirmed. If you need help, call {seller.phone} straight away — if the kitchen has not started, the order can
        be cancelled for a full refund.
      </P>
      <H>When you get a full refund</H>
      <UL items={[
        `${who} cancels your order or cannot fulfil it.`,
        "Money was debited but the order was not confirmed (a failed or timed-out payment).",
        "You were charged more than once for the same order.",
      ]} />
      <H>Problems with your food</H>
      <P>
        If items are missing, wrong or not fit to eat, tell the server immediately, or contact {seller.email}
        {" "}(or {seller.phone}) within 24 hours with your order number; photos help. Depending on the issue, the item
        may be replaced or refunded in full or in part.
      </P>
      <H>How and when refunds are paid</H>
      <P>
        Refunds go back to the original payment method through PhonePe. They are initiated within 2 business days of
        approval; banks usually credit them within 5–7 business days. Automatic reversals of failed payments are
        handled by PhonePe and your bank, usually within 5–7 business days.
      </P>
      <Seller seller={seller} />
      <Grievance />
    </>
  )
}

const DOCS = {
  privacy: { title: "Privacy Policy", Body: Privacy },
  terms: { title: "Terms of Use", Body: Terms },
  refunds: { title: "Refund & Cancellation Policy", Body: Refunds },
}

export default function LegalPage() {
  const { doc, restaurantId } = useParams()
  const base = useRestaurantBase()
  const page = DOCS[doc]
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(!!restaurantId)

  useEffect(() => { if (!restaurantId) applyTheme(DEFAULT_HEX) }, [restaurantId])
  useEffect(() => {
    if (!restaurantId) return
    restaurantApi.get(restaurantId)
      .then((r) => setRestaurant(r.data))
      .catch(() => {}) // unknown restaurant → fall back to the platform version
      .finally(() => setLoading(false))
  }, [restaurantId])
  useEffect(() => { if (page) document.title = `${page.title} · ${B.brand}` }, [page])

  if (!page) return <Navigate to="/" replace />
  const { title, Body } = page
  const seller = sellerFrom(restaurant)

  return (
    <div className="page" style={{ padding: "1rem 1.2rem 3rem" }}>
      <Link to={restaurantId ? base : "/"} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        <ArrowLeft size={16} /> {restaurant?.name || B.brand}
      </Link>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "1rem 0 0.2rem" }}>{title}</h1>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.6rem" }}>
        Last updated: {B.lastUpdated}
        {seller.isRestaurant ? ` · Seller: ${seller.name}` : ""}
      </p>
      {seller.incomplete && (
        <p style={{ fontSize: "0.8rem", padding: "0.6rem 0.8rem", borderRadius: 10, background: "rgba(251,191,36,0.12)", color: "var(--star)", border: "1px solid rgba(251,191,36,0.3)", marginBottom: "0.4rem" }}>
          {seller.isRestaurant
            ? "This restaurant hasn't filled in its legal name and support contact yet (dashboard → Settings → Business & legal)."
            : "Business details on this page are still placeholders — fill in mobile/src/lib/legal.js before launch."}
        </p>
      )}
      {loading ? <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading…</p> : <Body seller={seller} />}
      <LegalLinks base={restaurantId ? base : ""} style={{ marginTop: "2rem" }} />
    </div>
  )
}

// Deliberately tiny and muted — legal links are required, not something to
// give visual weight on an ordering page.
export function LegalLinks({ base = "", style }) {
  const link = { color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: 2 }
  return (
    <p style={{ textAlign: "center", fontSize: "0.65rem", lineHeight: 1.6, color: "var(--muted)", display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap", ...style }}>
      <Link to={`${base}/legal/privacy`} style={link}>Privacy</Link>
      <Link to={`${base}/legal/terms`} style={link}>Terms</Link>
      <Link to={`${base}/legal/refunds`} style={link}>Refunds</Link>
    </p>
  )
}
