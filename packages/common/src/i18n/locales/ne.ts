import type { PosMessages } from "./en.js";

export const ne: PosMessages = {
  "order.status.pending": "प्रतीक्षामा",
  "order.status.preparing": "तयारी हुँदै",
  "order.status.ready": "तयार",
  "order.status.delivered": "पुर्‍याइयो",
  "order.status.paid": "भुक्तानी भयो",
  "order.total": "जम्मा: {amount}",
  "order.acknowledge": "स्वीकार गर्नुहोस्",
  "order.acknowledged": "स्वीकार गरियो",
  "errors.validationFailed": "केही फिल्डहरू अमान्य छन्।",
  "errors.unauthenticated": "कृपया साइन इन गर्नुहोस्।",
  "errors.branchAccessDenied": "तपाईंसँग यो शाखामा पहुँच छैन।",
  "errors.roleForbidden": "तपाईंको भूमिकाले यो कार्य गर्न सक्दैन।",
  "errors.resourceNotFound": "फेला परेन।",
  "errors.orderStateConflict": "यसैबीच अर्डर परिवर्तन भयो।",
  "errors.rateLimited": "धेरै अनुरोधहरू — केही समयपछि प्रयास गर्नुहोस्।",
  "errors.internal": "केही गडबड भयो।",
};
