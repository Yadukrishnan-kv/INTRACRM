class PasswordRules {
  static const minLength = 10;
  static final _letterAndNumber = RegExp(r'^(?=.*[A-Za-z])(?=.*\d).+$');

  static String? validate(String? value, {String? email}) {
    final password = value ?? '';
    if (password.length < minLength) {
      return 'Password must be at least $minLength characters.';
    }
    if (!_letterAndNumber.hasMatch(password)) {
      return 'Password must include at least one letter and one number.';
    }
    final local = email?.split('@').first.toLowerCase();
    if (local != null &&
        local.isNotEmpty &&
        password.toLowerCase().contains(local)) {
      return 'Password must not contain your email name.';
    }
    return null;
  }
}
