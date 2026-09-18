class AuthSessionInvalidator {
  void Function()? _handler;

  void register(void Function() handler) {
    _handler = handler;
  }

  void invalidate() {
    _handler?.call();
  }
}
