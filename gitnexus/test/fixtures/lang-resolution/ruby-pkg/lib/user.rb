require_relative 'base_model'
require_relative 'serializable'

class User < BaseModel
  include Serializable

  def get_name
    @name
  end
end
