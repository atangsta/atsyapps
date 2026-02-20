import { redirect } from 'next/navigation'

// Magic links handle both signup and signin, so redirect to login
export default function SignupPage() {
  redirect('/login')
}
