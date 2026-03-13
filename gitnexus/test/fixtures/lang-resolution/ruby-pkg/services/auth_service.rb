require_relative '../lib/user'

class AuthService
  def authenticate(user)
    user.validate
    true
  end
end
