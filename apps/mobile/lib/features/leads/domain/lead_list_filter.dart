import 'lead.dart';

/// A single-dimension filter applied to the Leads list, used to drill down
/// from a report row (e.g. "Facebook" under By source) into the matching
/// leads. Filtering happens client-side over the already-synced lead list,
/// matching the offline-first [LeadListController] (which always loads the
/// full tenant list), the same way the existing My/Unassigned scope tabs do.
class LeadListFilter {
  const LeadListFilter({
    required this.label,
    this.status,
    this.quality,
    this.sourceId,
    this.matchUnknownSource = false,
    this.ownerMembershipId,
    this.matchUnassignedOwner = false,
    this.stageName,
    this.city,
  });

  /// Shown in the active-filter chip, e.g. "Source: Facebook".
  final String label;
  final String? status;
  final String? quality;
  final String? sourceId;
  final bool matchUnknownSource;
  final String? ownerMembershipId;
  final bool matchUnassignedOwner;
  final String? stageName;
  final String? city;

  bool matches(Lead lead) {
    if (status != null && lead.lifecycleStatus != status) {
      return false;
    }
    if (quality != null && lead.quality != quality) {
      return false;
    }
    if (matchUnknownSource) {
      if (lead.sourceId != null && lead.sourceId!.isNotEmpty) {
        return false;
      }
    } else if (sourceId != null && lead.sourceId != sourceId) {
      return false;
    }
    if (matchUnassignedOwner) {
      if (lead.ownerMembershipId != null && lead.ownerMembershipId!.isNotEmpty) {
        return false;
      }
    } else if (ownerMembershipId != null && lead.ownerMembershipId != ownerMembershipId) {
      return false;
    }
    if (stageName != null && lead.stageName != stageName) {
      return false;
    }
    if (city != null && lead.city != city) {
      return false;
    }
    return true;
  }
}
