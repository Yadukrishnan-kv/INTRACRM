DateTime parseUtc(String value) => DateTime.parse(value).toUtc();

String toIsoUtc(DateTime value) => value.toUtc().toIso8601String();
