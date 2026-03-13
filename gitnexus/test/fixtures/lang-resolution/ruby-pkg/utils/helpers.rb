require_relative '../lib/base_model'

def process_model(model)
  model.validate
  model.save
end
