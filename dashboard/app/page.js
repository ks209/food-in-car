import { LoginForm } from "@/components/login-form"
import { ShoppingBag, UtensilsCrossed, BarChart3 } from "lucide-react"

const features = [
  { icon: ShoppingBag, label: "Live orders", desc: "Track every order in real time" },
  { icon: UtensilsCrossed, label: "Menu control", desc: "Edit items, prices & options" },
  { icon: BarChart3, label: "Insights", desc: "Revenue & status at a glance" },
]

export default function LoginPage() {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
        {/* ambient brand glow */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-30 brand-bg" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full blur-3xl opacity-20 brand-bg" />

        <div className="flex items-center gap-3 relative anim-fade-up">
          <div className="h-9 w-9 rounded-xl brand-bg flex items-center justify-center text-white text-lg font-bold">
            F
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">FoodInCar</span>
        </div>

        <div className="relative anim-fade-up" style={{ animationDelay: "0.08s" }}>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.2em] mb-4">Restaurant Dashboard</p>
          <blockquote className="text-white text-3xl font-light leading-snug">
            Great food experiences start with{" "}
            <span className="brand-text-subtle font-medium">great management.</span>
          </blockquote>
          <p className="mt-6 text-zinc-500 text-sm">
            Manage orders, menus, and categories — all in one place.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 relative anim-fade-up" style={{ animationDelay: "0.16s" }}>
          {features.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.06]"
            >
              <div className="h-9 w-9 rounded-lg flex items-center justify-center brand-bg-subtle flex-shrink-0">
                <f.icon className="h-4.5 w-4.5 brand-text-subtle" />
              </div>
              <div>
                <p className="text-zinc-200 text-sm font-medium">{f.label}</p>
                <p className="text-zinc-500 text-xs">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm anim-fade-up" style={{ animationDelay: "0.1s" }}>
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="h-8 w-8 rounded-lg brand-bg flex items-center justify-center text-white font-bold text-sm">
              F
            </div>
            <span className="font-semibold text-foreground">FoodInCar</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1 tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Sign in to manage your restaurant</p>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
