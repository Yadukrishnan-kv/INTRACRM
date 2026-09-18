class PipelineStage {
  const PipelineStage({
    required this.id,
    required this.code,
    required this.name,
    required this.sortOrder,
    required this.winProbabilityBps,
    required this.isOpen,
    required this.isWon,
    required this.isLost,
  });

  final String id;
  final String code;
  final String name;
  final int sortOrder;
  final int winProbabilityBps;
  final bool isOpen;
  final bool isWon;
  final bool isLost;

  factory PipelineStage.fromJson(Map<String, dynamic> json) {
    return PipelineStage(
      id: json['id'] as String,
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      sortOrder: json['sortOrder'] as int? ?? 0,
      winProbabilityBps: json['winProbabilityBps'] as int? ?? 0,
      isOpen: json['isOpen'] as bool? ?? true,
      isWon: json['isWon'] as bool? ?? false,
      isLost: json['isLost'] as bool? ?? false,
    );
  }
}

class PipelineCard {
  const PipelineCard({
    required this.id,
    required this.leadNumber,
    required this.title,
    required this.stageId,
    required this.stageName,
    required this.lifecycleStatus,
    required this.version,
    this.customerName,
    this.primaryPhone,
    this.quality,
    this.estimatedValueMinor,
    this.currency = 'INR',
    this.ownerName,
  });

  final String id;
  final String leadNumber;
  final String title;
  final String? customerName;
  final String? primaryPhone;
  final String? quality;
  final int? estimatedValueMinor;
  final String currency;
  final String? ownerName;
  final String stageId;
  final String stageName;
  final String lifecycleStatus;
  final int version;

  String get displayName =>
      (customerName != null && customerName!.trim().isNotEmpty)
      ? customerName!
      : title;

  String get valueLabel {
    final minor = estimatedValueMinor;
    if (minor == null) {
      return '—';
    }
    final rupees = minor / 100;
    return '$currency ${rupees.toStringAsFixed(0)}';
  }

  PipelineCard copyWith({required String stageId, required String stageName, required int version}) {
    return PipelineCard(
      id: id,
      leadNumber: leadNumber,
      title: title,
      customerName: customerName,
      primaryPhone: primaryPhone,
      quality: quality,
      estimatedValueMinor: estimatedValueMinor,
      currency: currency,
      ownerName: ownerName,
      stageId: stageId,
      stageName: stageName,
      lifecycleStatus: lifecycleStatus,
      version: version,
    );
  }

  factory PipelineCard.fromJson(Map<String, dynamic> json) {
    return PipelineCard(
      id: json['id'] as String,
      leadNumber: json['leadNumber'] as String? ?? '',
      title: json['title'] as String? ?? '',
      customerName: json['customerName'] as String?,
      primaryPhone: json['primaryPhone'] as String?,
      quality: json['quality'] as String?,
      estimatedValueMinor: json['estimatedValueMinor'] as int?,
      currency: json['currency'] as String? ?? 'INR',
      ownerName: json['ownerName'] as String?,
      stageId: json['stageId'] as String? ?? '',
      stageName: json['stageName'] as String? ?? '',
      lifecycleStatus: json['lifecycleStatus'] as String? ?? 'open',
      version: json['version'] as int? ?? 1,
    );
  }
}

class LossReason {
  const LossReason({required this.id, required this.code, required this.name});

  final String id;
  final String code;
  final String name;

  factory LossReason.fromJson(Map<String, dynamic> json) {
    return LossReason(
      id: json['id'] as String,
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
    );
  }
}

class PipelineColumn {
  const PipelineColumn({
    required this.stage,
    required this.count,
    required this.valueMinor,
    required this.leads,
  });

  final PipelineStage stage;
  final int count;
  final int valueMinor;
  final List<PipelineCard> leads;

  PipelineColumn copyWith({List<PipelineCard>? leads, int? count}) {
    return PipelineColumn(
      stage: stage,
      count: count ?? this.count,
      valueMinor: valueMinor,
      leads: leads ?? this.leads,
    );
  }

  factory PipelineColumn.fromJson(Map<String, dynamic> json) {
    return PipelineColumn(
      stage: PipelineStage.fromJson(json['stage'] as Map<String, dynamic>),
      count: json['count'] as int? ?? 0,
      valueMinor: json['valueMinor'] as int? ?? 0,
      leads: [
        for (final item in json['leads'] as List? ?? const [])
          if (item is Map<String, dynamic>) PipelineCard.fromJson(item),
      ],
    );
  }
}

class PipelineBoard {
  const PipelineBoard({
    required this.pipelineId,
    required this.pipelineName,
    required this.columns,
    required this.lossReasons,
    required this.totalLeads,
    required this.open,
    required this.won,
    required this.lost,
  });

  final String pipelineId;
  final String pipelineName;
  final List<PipelineColumn> columns;
  final List<LossReason> lossReasons;
  final int totalLeads;
  final int open;
  final int won;
  final int lost;

  factory PipelineBoard.fromJson(Map<String, dynamic> json) {
    final pipeline = json['pipeline'] as Map<String, dynamic>? ?? const {};
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    return PipelineBoard(
      pipelineId: pipeline['id'] as String? ?? '',
      pipelineName: pipeline['name'] as String? ?? 'Pipeline',
      columns: [
        for (final item in json['columns'] as List? ?? const [])
          if (item is Map<String, dynamic>) PipelineColumn.fromJson(item),
      ],
      lossReasons: [
        for (final item in json['lossReasons'] as List? ?? const [])
          if (item is Map<String, dynamic>) LossReason.fromJson(item),
      ],
      totalLeads: totals['leads'] as int? ?? 0,
      open: totals['open'] as int? ?? 0,
      won: totals['won'] as int? ?? 0,
      lost: totals['lost'] as int? ?? 0,
    );
  }
}

class StageChange {
  const StageChange({
    required this.id,
    required this.toStageName,
    required this.toLifecycleStatus,
    required this.changedAt,
    this.fromStageName,
    this.reason,
    this.changedByName,
  });

  final String id;
  final String? fromStageName;
  final String toStageName;
  final String toLifecycleStatus;
  final String? reason;
  final String? changedByName;
  final DateTime changedAt;

  factory StageChange.fromJson(Map<String, dynamic> json) {
    return StageChange(
      id: json['id'] as String,
      fromStageName: json['fromStageName'] as String?,
      toStageName: json['toStageName'] as String? ?? '',
      toLifecycleStatus: json['toLifecycleStatus'] as String? ?? '',
      reason: json['reason'] as String?,
      changedByName: json['changedByName'] as String?,
      changedAt:
          DateTime.tryParse(json['changedAt'] as String? ?? '') ?? DateTime.now().toUtc(),
    );
  }
}

class FunnelStage {
  const FunnelStage({
    required this.id,
    required this.name,
    required this.currentCount,
    required this.reachedCount,
    required this.currentValueMinor,
    this.conversionFromPreviousBps,
    this.dropOffCount,
  });

  final String id;
  final String name;
  final int currentCount;
  final int reachedCount;
  final int currentValueMinor;
  final int? conversionFromPreviousBps;
  final int? dropOffCount;

  String get conversionLabel {
    final bps = conversionFromPreviousBps;
    if (bps == null) {
      return '—';
    }
    return '${(bps / 100).toStringAsFixed(1)}%';
  }

  factory FunnelStage.fromJson(Map<String, dynamic> json) {
    return FunnelStage(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      currentCount: json['currentCount'] as int? ?? 0,
      reachedCount: json['reachedCount'] as int? ?? 0,
      currentValueMinor: json['currentValueMinor'] as int? ?? 0,
      conversionFromPreviousBps: json['conversionFromPreviousBps'] as int?,
      dropOffCount: json['dropOffCount'] as int?,
    );
  }
}

class PipelineAnalytics {
  const PipelineAnalytics({
    required this.pipelineName,
    required this.leads,
    required this.open,
    required this.won,
    required this.lost,
    required this.pipelineValueMinor,
    required this.wonValueMinor,
    required this.stages,
    this.winRateBps,
    this.conversionBps,
  });

  final String pipelineName;
  final int leads;
  final int open;
  final int won;
  final int lost;
  final int pipelineValueMinor;
  final int wonValueMinor;
  final int? winRateBps;
  final int? conversionBps;
  final List<FunnelStage> stages;

  String get winRateLabel => _bps(winRateBps);
  String get conversionLabel => _bps(conversionBps);

  static String _bps(int? bps) {
    if (bps == null) {
      return '—';
    }
    return '${(bps / 100).toStringAsFixed(1)}%';
  }

  factory PipelineAnalytics.fromJson(Map<String, dynamic> json) {
    final pipeline = json['pipeline'] as Map<String, dynamic>? ?? const {};
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    return PipelineAnalytics(
      pipelineName: pipeline['name'] as String? ?? 'Pipeline',
      leads: totals['leads'] as int? ?? 0,
      open: totals['open'] as int? ?? 0,
      won: totals['won'] as int? ?? 0,
      lost: totals['lost'] as int? ?? 0,
      pipelineValueMinor: totals['pipelineValueMinor'] as int? ?? 0,
      wonValueMinor: totals['wonValueMinor'] as int? ?? 0,
      winRateBps: totals['winRateBps'] as int?,
      conversionBps: totals['conversionBps'] as int?,
      stages: [
        for (final item in json['stages'] as List? ?? const [])
          if (item is Map<String, dynamic>) FunnelStage.fromJson(item),
      ],
    );
  }
}
