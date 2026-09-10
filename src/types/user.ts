export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  status: 'ACTIVE' | 'SUSPENDED'
  last_login_at: string | null
}

export interface UserStats {
  total_users: number
  active_users: number
  suspended_users: number
  deleted_users: number
  by_role: {
    admin: number
    cashier: number
    reseller: number
    user: number
  }
}
