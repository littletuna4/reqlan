

class APythonClass:
    # This needs to meet the requirements layed out
    def __init__(self, name: str):
        self.name = name

    def say_hello(self):
        print(f"Hello, {self.name}!")

    def say_goodbye(self):
        print(f"Goodbye, {self.name}!")

    def say_hello_to(self, other: "APythonClass"):
        print(f"Hello, {other.name}!")
        