import 'package:uuid/uuid.dart';

class IdGenerator {
  const IdGenerator();

  static const _uuid = Uuid();

  String v4() => _uuid.v4();

  String v7() => _uuid.v7();
}
