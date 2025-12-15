/**
 * Reward Engine for ML Chatbot
 * Converts user behavior into numeric rewards for online learning
 * Enhanced for sales conversion optimization
 */

// Extended event types for sales funnel tracking
export type BehaviorEventType =
    | 'purchase'              // Legacy: completes purchase
    | 'product_click'         // Clicks product link
    | 'conversation_continue' // Continues conversation
    | 'leave'                 // Leaves chat
    | 'no_response'           // No response
    | 'message_sent'          // Sends a message
    // Sales funnel events
    | 'inquiry'               // Asks about products/services
    | 'inquiry_to_lead'       // Provides contact information
    | 'lead_to_order'         // Places an order
    | 'order_to_payment'      // Completes payment
    | 'repeat_purchase'       // Returning customer buys again
    | 'referral'              // Refers another customer
    // Engagement events
    | 'price_inquiry'         // Asks about price (high intent)
    | 'availability_check'    // Checks if product is available
    | 'objection_handled'     // Customer objection was addressed
    | 'upsell_accepted'       // Accepts upsell/cross-sell
    | 'discount_used';        // Uses a discount offer

export interface BehaviorEvent {
    eventType: BehaviorEventType;
    eventData?: Record<string, any>;
    senderId: string;
    leadId?: string;
    strategyId?: string;
    conversationId?: string;
    messageId?: string;
}

export interface RewardResult {
    reward: number;
    eventType: string;
    timestamp: string;
    rewardBreakdown?: {
        baseReward: number;
        valueBonus: number;
        engagementBonus: number;
    };
}

/**
 * Reward mapping based on user actions
 * Higher rewards for actions that directly lead to sales
 */
const REWARD_MAP: Record<string, number> = {
    // Core sales funnel (highest rewards)
    order_to_payment: 15,      // Payment completed - highest reward
    repeat_purchase: 20,       // Returning customer - even higher
    referral: 25,              // Referral - best possible outcome
    lead_to_order: 8,          // Order placed
    inquiry_to_lead: 5,        // Lead captured

    // Legacy purchase event
    purchase: 10,              // User completes purchase

    // High intent signals
    price_inquiry: 2,          // Asking price = buying intent
    availability_check: 1.5,   // Checking availability = intent
    upsell_accepted: 4,        // Accepts upsell
    discount_used: 3,          // Uses discount = commitment

    // Engagement signals
    product_click: 3,          // Clicks product link
    inquiry: 1,                // General inquiry
    objection_handled: 2,      // Objection addressed successfully
    conversation_continue: 1,  // Continues conversation
    message_sent: 0.5,         // User sends a message

    // Negative signals
    leave: -2,                 // User leaves chat
    no_response: 0,            // No response (neutral)
};

/**
 * Value multipliers for order values
 * Higher order values get bonus rewards
 */
const VALUE_TIERS = [
    { min: 0, max: 500, multiplier: 1.0 },
    { min: 500, max: 2000, multiplier: 1.2 },
    { min: 2000, max: 5000, multiplier: 1.5 },
    { min: 5000, max: 10000, multiplier: 1.8 },
    { min: 10000, max: Infinity, multiplier: 2.0 },
];

/**
 * Get value multiplier based on order value
 */
function getValueMultiplier(orderValue: number): number {
    const tier = VALUE_TIERS.find(t => orderValue >= t.min && orderValue < t.max);
    return tier?.multiplier || 1.0;
}

/**
 * Compute reward for a behavior event
 */
export function computeReward(event: BehaviorEvent): RewardResult {
    const baseReward = REWARD_MAP[event.eventType] || 0;
    let valueBonus = 0;
    let engagementBonus = 0;

    // Value-based bonus for monetary events
    if (event.eventData?.orderValue) {
        const multiplier = getValueMultiplier(event.eventData.orderValue);
        valueBonus = baseReward * (multiplier - 1); // Additional bonus from multiplier

        // Extra bonus for high-value orders (cap at 15)
        valueBonus += Math.min(15, event.eventData.orderValue / 500);
    }

    // Engagement bonus for conversation events
    if (event.eventType === 'conversation_continue' && event.eventData?.messageLength) {
        // Longer messages indicate higher engagement
        engagementBonus = Math.min(0.5, event.eventData.messageLength / 100);
    }

    // Speed bonus for fast responses
    if (event.eventData?.responseTimeMs && event.eventData.responseTimeMs < 5000) {
        engagementBonus += 0.2; // Small bonus for quick engagement
    }

    // Repeat customer bonus
    if (event.eventData?.isRepeatCustomer) {
        engagementBonus += 2; // Repeat customers are valuable
    }

    const totalReward = baseReward + valueBonus + engagementBonus;

    return {
        reward: Math.round(totalReward * 100) / 100, // Round to 2 decimals
        eventType: event.eventType,
        timestamp: new Date().toISOString(),
        rewardBreakdown: {
            baseReward,
            valueBonus: Math.round(valueBonus * 100) / 100,
            engagementBonus: Math.round(engagementBonus * 100) / 100,
        },
    };
}

/**
 * Get reward value for an event type (for reference)
 */
export function getRewardForEventType(eventType: string): number {
    return REWARD_MAP[eventType] || 0;
}

/**
 * Get all reward mappings (for UI/display)
 */
export function getAllRewardMappings(): Record<string, number> {
    return { ...REWARD_MAP };
}

/**
 * Get reward categories for display
 */
export function getRewardCategories(): { category: string; events: { type: string; reward: number }[] }[] {
    return [
        {
            category: 'Sales Funnel',
            events: [
                { type: 'referral', reward: REWARD_MAP.referral },
                { type: 'repeat_purchase', reward: REWARD_MAP.repeat_purchase },
                { type: 'order_to_payment', reward: REWARD_MAP.order_to_payment },
                { type: 'lead_to_order', reward: REWARD_MAP.lead_to_order },
                { type: 'inquiry_to_lead', reward: REWARD_MAP.inquiry_to_lead },
            ],
        },
        {
            category: 'High Intent',
            events: [
                { type: 'upsell_accepted', reward: REWARD_MAP.upsell_accepted },
                { type: 'discount_used', reward: REWARD_MAP.discount_used },
                { type: 'product_click', reward: REWARD_MAP.product_click },
                { type: 'price_inquiry', reward: REWARD_MAP.price_inquiry },
            ],
        },
        {
            category: 'Engagement',
            events: [
                { type: 'objection_handled', reward: REWARD_MAP.objection_handled },
                { type: 'inquiry', reward: REWARD_MAP.inquiry },
                { type: 'conversation_continue', reward: REWARD_MAP.conversation_continue },
                { type: 'message_sent', reward: REWARD_MAP.message_sent },
            ],
        },
        {
            category: 'Negative',
            events: [
                { type: 'leave', reward: REWARD_MAP.leave },
                { type: 'no_response', reward: REWARD_MAP.no_response },
            ],
        },
    ];
}

