class Person
  attr_accessor :name, :age
  attr_reader :id
  attr_writer :email

  def greet
    "Hello, #{@name}"
  end
end
