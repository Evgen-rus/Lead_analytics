import re


def normalize_phone(value: object) -> str:
    if value is None:
        return ""
    digits = re.sub(r"\D+", "", str(value))
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return digits
    if len(digits) == 10:
        return "7" + digits
    return ""
