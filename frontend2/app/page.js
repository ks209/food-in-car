import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-700 mb-2">Restaurant Management Hub</h1>
          <p className="text-gray-600">Sign in to manage your restaurant operations</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
