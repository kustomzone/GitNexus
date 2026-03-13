require_relative 'user'
require_relative 'repo'

def process_entities
  user = User.new
  repo = Repo.new
  user.save
  repo.save
end
