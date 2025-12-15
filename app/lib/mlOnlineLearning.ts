/**
 * Online Learning Service for ML Chatbot
 * Implements Contextual Bandits algorithm for strategy selection
 */

import { supabase } from './supabase';
import { computeReward, BehaviorEvent } from './mlRewardEngine';
import crypto from 'crypto';

export interface Strategy {
    id: string;
    strategyName: string;
    strategyDescription: string;
    strategyType: string;
    defaultPromptTemplate: string;
    isActive: boolean;
}

export interface ContextFeatures {
    conversationStage: 'greeting' | 'qualification' | 'information' | 'closing' | 'followup';
    messageCount: number;
    userType?: 'new' | 'returning' | 'vip';
    hasProductInterest?: boolean;
    lastResponseTime?: number; // minutes since last user message
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek?: string;
}

/**
 * Hash context features to create a context identifier
 */
function hashContext(features: ContextFeatures): string {
    const contextString = JSON.stringify({
        stage: features.conversationStage,
        userType: features.userType || 'new',
        hasInterest: features.hasProductInterest || false,
        timeOfDay: features.timeOfDay || 'afternoon',
    });

    return crypto.createHash('sha256').update(contextString).digest('hex').substring(0, 16);
}

/**
 * Get conversation stage from message count
 */
function getConversationStage(messageCount: number, hasProductInterest: boolean): ContextFeatures['conversationStage'] {
    if (messageCount <= 2) return 'greeting';
    if (messageCount <= 5 && !hasProductInterest) return 'qualification';
    if (hasProductInterest) return 'information';
    if (messageCount > 10) return 'closing';
    return 'followup';
}

/**
 * Get time of day from current time (PHT)
 */
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
    const now = new Date();
    const phtOffset = 8 * 60; // UTC+8 in minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const pht = new Date(utc + (phtOffset * 60000));
    const hour = pht.getHours();

    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * Build context features from conversation history
 */
export async function buildContext(senderId: string, leadId?: string): Promise<ContextFeatures> {
    try {
        // Get conversation history
        const { data: messages } = await supabase
            .from('conversations')
            .select('role, content, created_at')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(20);

        const messageCount = messages?.length || 0;

        // Check for product interest keywords
        const productKeywords = ['price', 'buy', 'purchase', 'order', 'cost', 'magkano', 'bili'];
        interface Message { role: string; content?: string; created_at: string; }
        const hasProductInterest = messages?.some((msg: Message) =>
            msg.role === 'user' &&
            productKeywords.some(keyword => msg.content?.toLowerCase().includes(keyword))
        ) || false;

        // Get last user message time
        const lastUserMessage = messages?.find((msg: Message) => msg.role === 'user');
        const lastResponseTime = lastUserMessage
            ? (Date.now() - new Date(lastUserMessage.created_at).getTime()) / (1000 * 60)
            : undefined;

        // Get user type (simplified - check if returning)
        const { count } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('sender_id', senderId);

        const userType = (count && count > 10) ? 'returning' : 'new';

        return {
            conversationStage: getConversationStage(messageCount, hasProductInterest),
            messageCount,
            userType,
            hasProductInterest,
            lastResponseTime,
            timeOfDay: getTimeOfDay(),
            dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        };
    } catch (error) {
        console.error('[ML Learning] Error building context:', error);
        // Return default context
        return {
            conversationStage: 'greeting',
            messageCount: 0,
            userType: 'new',
            hasProductInterest: false,
            timeOfDay: getTimeOfDay(),
        };
    }
}

/**
 * Select best strategy using Contextual Bandits (epsilon-greedy)
 */
export async function selectStrategy(
    context: ContextFeatures,
    senderId?: string,
    epsilon: number = 0.2
): Promise<Strategy | null> {
    try {
        const contextHash = hashContext(context);

        // Store/update context if senderId provided
        if (senderId) {
            await supabase
                .from('ml_conversation_contexts')
                .upsert({
                    sender_id: senderId,
                    context_features: context,
                    context_hash: contextHash,
                    message_count: context.messageCount,
                    last_message_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }, {
                    onConflict: 'sender_id,context_hash',
                });
        }

        // Get top strategies for this context
        const { data: topStrategies, error } = await supabase.rpc('get_top_strategies', {
            p_context_hash: contextHash,
            p_limit: 10,
        });

        if (error) {
            console.error('[ML Learning] Error getting top strategies:', error);
        }

        // Get all active strategies
        const { data: allStrategies, error: strategiesError } = await supabase
            .from('ml_strategies')
            .select('*')
            .eq('is_active', true);

        if (strategiesError || !allStrategies || allStrategies.length === 0) {
            console.error('[ML Learning] Error fetching strategies:', strategiesError);
            return null;
        }

        // Epsilon-greedy: explore with probability epsilon, exploit otherwise
        const shouldExplore = Math.random() < epsilon;

        if (shouldExplore || !topStrategies || topStrategies.length === 0) {
            // Explore: select random strategy
            const randomStrategy = allStrategies[Math.floor(Math.random() * allStrategies.length)];
            return {
                id: randomStrategy.id,
                strategyName: randomStrategy.strategy_name,
                strategyDescription: randomStrategy.strategy_description,
                strategyType: randomStrategy.strategy_type,
                defaultPromptTemplate: randomStrategy.default_prompt_template,
                isActive: randomStrategy.is_active,
            };
        } else {
            // Exploit: select best performing strategy
            const bestStrategyId = topStrategies[0].strategy_id;
            const bestStrategy = allStrategies.find((s: { id: string }) => s.id === bestStrategyId);

            if (bestStrategy) {
                return {
                    id: bestStrategy.id,
                    strategyName: bestStrategy.strategy_name,
                    strategyDescription: bestStrategy.strategy_description,
                    strategyType: bestStrategy.strategy_type,
                    defaultPromptTemplate: bestStrategy.default_prompt_template,
                    isActive: bestStrategy.is_active,
                };
            }
        }

        // Fallback: return first active strategy
        return {
            id: allStrategies[0].id,
            strategyName: allStrategies[0].strategy_name,
            strategyDescription: allStrategies[0].strategy_description,
            strategyType: allStrategies[0].strategy_type,
            defaultPromptTemplate: allStrategies[0].default_prompt_template,
            isActive: allStrategies[0].is_active,
        };
    } catch (error) {
        console.error('[ML Learning] Error selecting strategy:', error);
        return null;
    }
}

/**
 * Update learning model with new reward
 */
export async function updateLearning(
    strategyId: string,
    context: ContextFeatures,
    reward: number
): Promise<void> {
    try {
        const contextHash = hashContext(context);

        // Update strategy performance
        await supabase.rpc('update_strategy_performance', {
            p_strategy_id: strategyId,
            p_context_hash: contextHash,
            p_reward: reward,
        });

        console.log(`[ML Learning] Updated strategy ${strategyId} for context ${contextHash} with reward ${reward}`);
    } catch (error) {
        console.error('[ML Learning] Error updating learning:', error);
    }
}

/**
 * Record behavior event and update learning
 */
export async function recordBehaviorAndLearn(
    event: BehaviorEvent,
    context: ContextFeatures
): Promise<void> {
    try {
        const rewardResult = computeReward(event);

        // Store behavior event
        const { error: eventError } = await supabase
            .from('ml_behavior_events')
            .insert({
                sender_id: event.senderId,
                lead_id: event.leadId || null,
                event_type: event.eventType,
                event_data: event.eventData || {},
                conversation_id: event.conversationId || null,
                message_id: event.messageId || null,
                strategy_id: event.strategyId || null,
                reward_value: rewardResult.reward,
            });

        if (eventError) {
            console.error('[ML Learning] Error storing behavior event:', eventError);
        }

        // Update learning if strategy was used
        if (event.strategyId) {
            await updateLearning(event.strategyId, context, rewardResult.reward);
        }
    } catch (error) {
        console.error('[ML Learning] Error recording behavior:', error);
    }
}

