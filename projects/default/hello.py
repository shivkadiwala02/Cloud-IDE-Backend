# Sample Python file for Cloud IDE

print("Hello from Python!")

# Variables and basic operations
name = "Developer"
age = 25
print(f"My name is {name} and I am {age} years old.")

# A simple loop
print("Counting from 1 to 5:")
for i in range(1, 6):
    print(f"Number: {i}")

# A simple function
def greet(name):
    return f"Hello, {name}!"

print(greet("Python User"))

# List operations
numbers = [1, 2, 3, 4, 5]
squared = [x**2 for x in numbers]
print("Original numbers:", numbers)
print("Squared numbers:", squared)
