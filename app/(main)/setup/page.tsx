'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, ShieldCheck, MessageSquare, ClipboardList, Wand2, Zap } from 'lucide-react';

type StepKey = 'identity' | 'botName' | 'goals' | 'knowledge' | 'flow' | 'tone' | 'style' | 'rules' | 'extras';

type StatusState = 'idle' | 'saving' | 'saved' | 'error';

const goalOptions = [
    'Answer customer questions',
    'Provide product recommendations',
    'Help with bookings or orders',
    'Guide through product or service usage',
    'Offer technical support',
    'Collect customer feedback/surveys',
    'Manage appointments',
    'Provide shipping or order status updates',
    'Help with returns and refunds',
];

const knowledgeOptions = [
    'FAQs (Frequently Asked Questions)',
    'Product/service details',
    'Pricing information',
    'Company policies',
    'User accounts or customer profiles',
    'Order or shipping status',
    'Support documents (manuals, guides, etc.)',
    'Internal team knowledge or resources',
];

const toneOptions = [
    'Friendly & Casual',
    'Professional & Formal',
    'Helpful & Supportive',
    'Fun & Entertaining',
    'Empathetic & Caring',
    'Direct & Efficient',
];

const styleOptions = [
    'Ask clarifying questions when necessary',
    'Provide brief and to-the-point answers',
    'Offer suggestions or options to the user',
    'Avoid using jargon or technical terms',
    'Ask follow-up questions to gather more details',
    'Always ask if further assistance is needed',
    'Suggest related products or services based on user input',
    'Use emojis or icons to make the chat more engaging',
];

const ruleOptions = [
    'Do not ask for sensitive personal information (e.g., passwords, credit card numbers)',
    'Always provide accurate and verified information',
    'Never provide medical or legal advice',
    'Offer the option to speak with a human agent if necessary',
    'Ensure compliance with data privacy regulations',
    'Avoid making promises or guarantees',
    'Keep the conversation respectful and professional at all times',
    'Do not spam users with repetitive responses',
];

export default function SetupPage() {
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [statusByStep, setStatusByStep] = useState<Record<StepKey, { state: StatusState; message?: string }>>({
        identity: { state: 'idle' },
        botName: { state: 'idle' },
        goals: { state: 'idle' },
        knowledge: { state: 'idle' },
        flow: { state: 'idle' },
        tone: { state: 'idle' },
        style: { state: 'idle' },
        rules: { state: 'idle' },
        extras: { state: 'idle' },
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [storeSettingsSaved, setStoreSettingsSaved] = useState(false);
    const [instructionsPreview, setInstructionsPreview] = useState('');
    const [lastStageApplied, setLastStageApplied] = useState<StepKey | null>(null);
    const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [answers, setAnswers] = useState({
        userName: '',
        userEmail: '',
        companyName: '',
        chatbotName: '',
        goalSelections: new Set<string>(),
        otherGoal: '',
        knowledgeSources: new Set<string>(),
        otherKnowledge: '',
        conversationFlowChoice: 'guided',
        conversationFlowDetail: '',
        tonePreferences: new Set<string>(),
        stylePreferences: new Set<string>(),
        botRules: new Set<string>(),
        otherRule: '',
        additionalRequests: '',
    });

    const steps: { key: StepKey; title: string; description: string }[] = [
        { key: 'identity', title: 'Your Details', description: 'For personalized communication and follow-ups.' },
        { key: 'botName', title: 'Chatbot Name', description: 'Choose a friendly, simple name that represents your brand.' },
        { key: 'goals', title: 'Chatbot Goals', description: 'Select what the bot should help users with.' },
        { key: 'knowledge', title: 'Knowledge Base', description: 'Pick the information sources the bot should rely on.' },
        { key: 'flow', title: 'Conversation Flow', description: 'How should the conversation proceed?' },
        { key: 'tone', title: 'Tone & Personality', description: 'How should the bot sound?' },
        { key: 'style', title: 'Conversation Style', description: 'How should the bot interact in each reply?' },
        { key: 'rules', title: 'Bot Settings', description: 'Guardrails and safety rules to enforce every time.' },
        { key: 'extras', title: 'Additional Requests', description: 'Any special instructions or custom features.' },
    ];

    const totalSteps = steps.length;
    const progressPercent = Math.round(((currentStep + 1) / totalSteps) * 100);

    const setStepStatus = (key: StepKey, state: StatusState, message?: string) => {
        setStatusByStep((prev) => ({
            ...prev,
            [key]: { state, message },
        }));
    };

    const toggleSetValue = (setKey: keyof typeof answers, value: string) => {
        setAnswers((prev) => {
            const nextSet = new Set(prev[setKey] as Set<string>);
            if (nextSet.has(value)) {
                nextSet.delete(value);
            } else {
                nextSet.add(value);
            }
            return { ...prev, [setKey]: nextSet };
        });
    };

    const buildPayload = () => {
        const goals = Array.from(answers.goalSelections);
        if (answers.otherGoal.trim()) goals.push(answers.otherGoal.trim());

        const knowledge = Array.from(answers.knowledgeSources);
        if (answers.otherKnowledge.trim()) knowledge.push(answers.otherKnowledge.trim());

        const rules = Array.from(answers.botRules);
        if (answers.otherRule.trim()) rules.push(answers.otherRule.trim());

        return {
            userName: answers.userName.trim(),
            userEmail: answers.userEmail.trim(),
            companyName: answers.companyName.trim(),
            chatbotName: (answers.chatbotName || answers.companyName || 'Assistant').trim(),
            goalSelections: goals,
            knowledgeSources: knowledge,
            conversationFlowChoice: answers.conversationFlowChoice,
            conversationFlowDetail: answers.conversationFlowDetail.trim(),
            tonePreferences: Array.from(answers.tonePreferences),
            stylePreferences: Array.from(answers.stylePreferences),
            botRules: rules,
            additionalRequests: answers.additionalRequests.trim(),
        };
    };

    const ensureStoreSettings = async (payload: ReturnType<typeof buildPayload>) => {
        if (storeSettingsSaved) return;
        try {
            await fetch('/api/store-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeName: payload.companyName || payload.chatbotName || 'New Store',
                    storeType: 'ecommerce',
                    setupCompleted: true,
                }),
            });
            setStoreSettingsSaved(true);
        } catch (error) {
            console.warn('Store settings could not be auto-created (non-blocking):', error);
        }
    };

    const runAutoSetup = async (stage: StepKey) => {
        const payload = buildPayload();
        setStepStatus(stage, 'saving', 'Letting the AI configure this section...');
        setIsSubmitting(true);

        try {
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage, answers: payload }),
            });
            const data = await res.json();

            if (res.ok && data.success !== false) {
                setStepStatus(stage, 'saved', 'AI setup applied');
                setLastStageApplied(stage);
                setInstructionsPreview(data.instructionsPreview || '');
                setBanner({ type: 'success', message: 'Saved! AI is configuring your bot as you go.' });
                ensureStoreSettings(payload);
            } else {
                setStepStatus(stage, 'error', data?.error || 'Something went wrong');
                setBanner({ type: 'error', message: data?.error || 'Failed to auto-setup this section.' });
            }
        } catch (error: any) {
            setStepStatus(stage, 'error', error?.message || 'Network error');
            setBanner({ type: 'error', message: 'Network error while saving. Please try again.' });
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setBanner(null), 4000);
        }
    };

    const isStepComplete = (key: StepKey) => {
        switch (key) {
            case 'identity':
                return Boolean(answers.userName.trim() && answers.userEmail.trim() && answers.companyName.trim());
            case 'botName':
                return Boolean((answers.chatbotName || answers.companyName).trim());
            case 'goals':
                return answers.goalSelections.size > 0 || Boolean(answers.otherGoal.trim());
            case 'knowledge':
                return answers.knowledgeSources.size > 0 || Boolean(answers.otherKnowledge.trim());
            case 'flow':
                return Boolean(answers.conversationFlowChoice);
            case 'tone':
                return answers.tonePreferences.size > 0;
            case 'style':
                return answers.stylePreferences.size > 0;
            case 'rules':
                return answers.botRules.size > 0 || Boolean(answers.otherRule.trim());
            case 'extras':
                return true;
            default:
                return false;
        }
    };

    const handleContinue = async () => {
        const stepKey = steps[currentStep].key;
        if (!isStepComplete(stepKey)) {
            setStepStatus(stepKey, 'error', 'Please complete this step before continuing.');
            return;
        }
        await runAutoSetup(stepKey);
        if (currentStep < steps.length - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep === 0) return;
        setCurrentStep((prev) => prev - 1);
    };

    const renderStatus = (key: StepKey) => {
        const status = statusByStep[key]?.state;
        if (status === 'saved') {
            return <span className="flex items-center gap-1 text-emerald-600 text-sm"><CheckCircle2 size={16} /> Saved</span>;
        }
        if (status === 'saving') {
            return <span className="flex items-center gap-1 text-amber-600 text-sm"><Loader2 className="animate-spin" size={16} /> Saving...</span>;
        }
        if (status === 'error') {
            return <span className="flex items-center gap-1 text-red-600 text-sm"><AlertCircle size={16} /> Needs attention</span>;
        }
        return <span className="text-gray-400 text-sm">Pending</span>;
    };

    const instructionsSnippet = useMemo(() => {
        if (!instructionsPreview) return '';
        return instructionsPreview.length > 520 ? `${instructionsPreview.slice(0, 520)}...` : instructionsPreview;
    }, [instructionsPreview]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-white">
            <div className="max-w-6xl mx-auto px-4 py-10 lg:py-14">
                <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-teal-600 font-semibold">
                            <Sparkles size={16} />
                            Auto Setup
                        </div>
                        <h1 className="text-4xl font-bold text-gray-900 mt-2">New User Onboarding</h1>
                        <p className="text-gray-500 mt-2 max-w-2xl">
                            Fill the form once. The AI configures instructions, goals, rules, and conversation flow right after each section so you never wait at the end.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 text-sm bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                        <ShieldCheck className="text-emerald-500" size={18} />
                        <div>
                            <p className="text-gray-900 font-semibold">Incremental AI setup</p>
                            <p className="text-gray-500 text-xs">Runs after every saved step</p>
                        </div>
                    </div>
                </header>

                <div className="w-full bg-gray-100 h-2 rounded-full mb-6 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500" style={{ width: `${progressPercent}%` }} />
                </div>

                {banner && (
                    <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl ${banner.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                        {banner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        <span>{banner.message}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
                    <section className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6 md:p-8 space-y-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-gray-400 font-semibold">
                                    <ClipboardList size={16} />
                                    Step {currentStep + 1} of {totalSteps}
                                </div>
                                <h2 className="text-2xl font-semibold text-gray-900 mt-2">{steps[currentStep].title}</h2>
                                <p className="text-gray-500 mt-1">{steps[currentStep].description}</p>
                            </div>
                            <div>
                                {renderStatus(steps[currentStep].key)}
                            </div>
                        </div>

                        <div className="space-y-5">
                            {steps[currentStep].key === 'identity' && (
                                <>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-gray-700">Your Name *</label>
                                            <input
                                                type="text"
                                                value={answers.userName}
                                                onChange={(e) => setAnswers((prev) => ({ ...prev, userName: e.target.value }))}
                                                placeholder="e.g., Jamie Cruz"
                                                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-gray-700">Your Email *</label>
                                            <input
                                                type="email"
                                                value={answers.userEmail}
                                                onChange={(e) => setAnswers((prev) => ({ ...prev, userEmail: e.target.value }))}
                                                placeholder="you@email.com"
                                                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Company/Brand Name *</label>
                                        <input
                                            type="text"
                                            value={answers.companyName}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, companyName: e.target.value }))}
                                            placeholder="e.g., Sunrise Ventures"
                                            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        />
                                    </div>
                                </>
                            )}

                            {steps[currentStep].key === 'botName' && (
                                <div>
                                    <label className="text-sm font-medium text-gray-700">What would you like to name your chatbot?</label>
                                    <p className="text-xs text-gray-500 mt-1">Example: "HelpBot," "CustomerCareBot"</p>
                                    <input
                                        type="text"
                                        value={answers.chatbotName}
                                        onChange={(e) => setAnswers((prev) => ({ ...prev, chatbotName: e.target.value }))}
                                        placeholder="Your bot's name"
                                        className="mt-3 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                    />
                                </div>
                            )}

                            {steps[currentStep].key === 'goals' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">Select all that apply:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {goalOptions.map((goal) => (
                                            <label key={goal} className={`flex items-start gap-3 p-3 rounded-2xl border ${answers.goalSelections.has(goal) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={answers.goalSelections.has(goal)}
                                                    onChange={() => toggleSetValue('goalSelections', goal)}
                                                    className="mt-1 text-emerald-600"
                                                />
                                                <span className="text-gray-800 text-sm">{goal}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Other goal</label>
                                        <input
                                            type="text"
                                            value={answers.otherGoal}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, otherGoal: e.target.value }))}
                                            placeholder="Other goal (optional)"
                                            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'knowledge' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">Select all relevant knowledge sources:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {knowledgeOptions.map((item) => (
                                            <label key={item} className={`flex items-start gap-3 p-3 rounded-2xl border ${answers.knowledgeSources.has(item) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={answers.knowledgeSources.has(item)}
                                                    onChange={() => toggleSetValue('knowledgeSources', item)}
                                                    className="mt-1 text-emerald-600"
                                                />
                                                <span className="text-gray-800 text-sm">{item}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Other knowledge source</label>
                                        <input
                                            type="text"
                                            value={answers.otherKnowledge}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, otherKnowledge: e.target.value }))}
                                            placeholder="Other source (optional)"
                                            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'flow' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-gray-600">Choose the best option:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {[
                                            { value: 'linear', title: 'Linear Flow', desc: 'One question, one response, then move to the next.' },
                                            { value: 'guided', title: 'Guided Flow', desc: 'Step-by-step with clear instructions or options.' },
                                            { value: 'dynamic', title: 'Dynamic Flow', desc: 'Open-ended with multiple paths, adjusting based on responses.' },
                                            { value: 'branching', title: 'Branching Flow', desc: 'Different responses based on specific user choices or inputs.' },
                                            { value: 'other', title: 'Other', desc: 'Describe a custom flow.' },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setAnswers((prev) => ({ ...prev, conversationFlowChoice: option.value }))}
                                                className={`p-4 text-left rounded-2xl border transition ${answers.conversationFlowChoice === option.value ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}
                                            >
                                                <p className="font-semibold text-gray-900">{option.title}</p>
                                                <p className="text-sm text-gray-600 mt-1">{option.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Notes or details (optional)</label>
                                        <textarea
                                            value={answers.conversationFlowDetail}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, conversationFlowDetail: e.target.value }))}
                                            rows={3}
                                            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                            placeholder="Any specific branching logic, required order, or exceptions."
                                        />
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'tone' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">Select all that apply:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {toneOptions.map((tone) => (
                                            <label key={tone} className={`flex items-start gap-3 p-3 rounded-2xl border ${answers.tonePreferences.has(tone) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={answers.tonePreferences.has(tone)}
                                                    onChange={() => toggleSetValue('tonePreferences', tone)}
                                                    className="mt-1 text-emerald-600"
                                                />
                                                <span className="text-gray-800 text-sm">{tone}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'style' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">Select all that apply:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {styleOptions.map((style) => (
                                            <label key={style} className={`flex items-start gap-3 p-3 rounded-2xl border ${answers.stylePreferences.has(style) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={answers.stylePreferences.has(style)}
                                                    onChange={() => toggleSetValue('stylePreferences', style)}
                                                    className="mt-1 text-emerald-600"
                                                />
                                                <span className="text-gray-800 text-sm">{style}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'rules' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-gray-600">Select all that apply:</p>
                                    <div className="grid md:grid-cols-2 gap-3">
                                        {ruleOptions.map((rule) => (
                                            <label key={rule} className={`flex items-start gap-3 p-3 rounded-2xl border ${answers.botRules.has(rule) ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-200'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={answers.botRules.has(rule)}
                                                    onChange={() => toggleSetValue('botRules', rule)}
                                                    className="mt-1 text-emerald-600"
                                                />
                                                <span className="text-gray-800 text-sm">{rule}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Other rules</label>
                                        <input
                                            type="text"
                                            value={answers.otherRule}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, otherRule: e.target.value }))}
                                            placeholder="Any additional rule to enforce (optional)"
                                            className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            )}

                            {steps[currentStep].key === 'extras' && (
                                <div>
                                    <label className="text-sm font-medium text-gray-700">Additional comments or custom requests</label>
                                    <textarea
                                        value={answers.additionalRequests}
                                        onChange={(e) => setAnswers((prev) => ({ ...prev, additionalRequests: e.target.value }))}
                                        rows={4}
                                        placeholder="Any special instructions, integrations, or edge cases you want the AI to consider."
                                        className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={handleBack}
                                disabled={currentStep === 0 || isSubmitting}
                                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 disabled:opacity-40"
                            >
                                <ArrowLeft size={18} />
                                Back
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => runAutoSetup(steps[currentStep].key)}
                                    disabled={!isStepComplete(steps[currentStep].key) || isSubmitting}
                                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40"
                                >
                                    <Wand2 size={16} />
                                    Save & run AI
                                </button>
                                <button
                                    type="button"
                                    onClick={handleContinue}
                                    disabled={!isStepComplete(steps[currentStep].key) || isSubmitting}
                                    className="flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-40"
                                >
                                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                                    {currentStep === steps.length - 1 ? 'Finish Setup' : 'Save & Continue'}
                                </button>
                            </div>
                        </div>
                    </section>

                    <aside className="bg-white border border-gray-200 rounded-3xl shadow-sm p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <Zap className="text-amber-500" size={18} />
                            <div>
                                <p className="font-semibold text-gray-900">Live AI setup</p>
                                <p className="text-sm text-gray-500">Runs right after each section is saved.</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {steps.map((step, index) => (
                                <div key={step.key} className={`flex items-center justify-between p-3 rounded-2xl border ${index === currentStep ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">{index + 1}. {step.title}</p>
                                        <p className="text-xs text-gray-500">{step.description}</p>
                                    </div>
                                    {renderStatus(step.key)}
                                </div>
                            ))}
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-gray-700 font-semibold mb-2">
                                <MessageSquare size={16} />
                                <span>Latest AI instructions</span>
                            </div>
                            {instructionsSnippet ? (
                                <p className="text-sm text-gray-700 leading-relaxed">{instructionsSnippet}</p>
                            ) : (
                                <p className="text-sm text-gray-500">AI will display the generated instructions preview here after the first save.</p>
                            )}
                            {lastStageApplied && (
                                <p className="text-xs text-gray-400 mt-2">Updated after: {steps.find((s) => s.key === lastStageApplied)?.title}</p>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
