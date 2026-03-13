require_relative 'utils'

def save(data)
  # local save shadows utils#save
  data.to_s
end

def run
  save('test')
end
