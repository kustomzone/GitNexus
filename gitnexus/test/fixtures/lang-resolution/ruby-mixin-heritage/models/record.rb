require_relative '../concerns/auditable'
require_relative '../concerns/cacheable'
require_relative '../concerns/hookable'

class Record
  include Auditable
  extend Cacheable
  prepend Hookable
end
